> **Implementação atual:** além do bloco retangular descrito no briefing abaixo,
> o aplicativo oferece planta 2D por ambientes, coordenadas em metros, áreas
> calculadas e geração da maquete 3D para edição de materiais.
> Veja o fluxo e os limites em [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#planta-2d-por-ambientes).

# Prompt: Build a Web App to Create and Edit EnergyPlus epJSON Files

Copy everything below into your coding tool of choice (Claude Code, Cursor, etc.).

---

## Context

I need a web application that lets people **create and edit epJSON files** —
the JSON-based input format for EnergyPlus (the building energy simulation
engine), which is replacing the legacy IDF/IDD format — and get to a runnable
simulation with minimal manual input.

The app has **two modes**:

- **Basic mode (default, this version's priority):** a guided wizard that asks
  a handful of high-level questions and generates a complete, valid epJSON
  file underneath. Geometry in this first version is a simple **box/shoebox
  model** (rectangular footprint, N floors, one thermal zone per floor) — no
  polygon drawing tool yet.
- **Expert mode:** a full schema-driven object editor (browse every object
  type, edit fields directly, raw JSON view) for people who want to hand-edit
  what the wizard generated, or build a file from scratch. This is the escape
  hatch, not the front door.

Both modes read/write the same underlying epJSON document, so a user can
run the Basic wizard, then flip to Expert mode to tweak one field EnergyPlus
requires that the wizard doesn't expose, then flip back.

---

## Background: epJSON format facts

- An epJSON file is a single JSON object. Each top-level key is an **object
  type** (e.g. `"Building"`, `"Zone"`, `"Material"`, `"BuildingSurface:Detailed"`).
- Under each object type is a dictionary keyed by **object name**, whose value
  is the field data for that instance, e.g.:
  ```json
  {
    "Zone": {
      "Living Room": {
        "direction_of_relative_north": 0,
        "x_origin": 0,
        "ceiling_height": "autocalculate"
      }
    }
  }
  ```
- Field names are snake_case. Fields can be numeric, integer, string (often an
  enum with a fixed default), autosizable/autocalculable numeric (accepts a
  number OR the literal string `"Autosize"`/`"Autocalculate"`), or **arrays of
  extensible groups** (repeated sub-objects, e.g. a surface's list of
  `{vertex_x_coordinate, vertex_y_coordinate, vertex_z_coordinate}`).
- Many string fields are **references** to the _name_ of another object
  elsewhere in the file (e.g. a `Zone`'s name is referenced by
  `BuildingSurface:Detailed.zone_name`). There is no foreign-key enforcement
  in the JSON itself — validity is purely by convention.
- Some fields are required, others have documented defaults and may be
  omitted.

### Source of truth for the schema — do not hand-transcribe the docs page

The human-readable reference at
https://energyplus.readthedocs.io/en/latest/schema.html is a lossy rendering
of the real, authoritative artifact: EnergyPlus ships a full **JSON Schema**
file called `Energy+.schema.epJSON`, which formally defines every object
type and field (name, type, units, default, minimum/maximum, enum values,
`required`, `extensible` array definitions, `object-list`/`external-list`
reference annotations, etc.) using JSON Schema syntax plus EnergyPlus-specific
extension keywords.

- Included in every EnergyPlus release and published in the GitHub repo, e.g.:
  `https://github.com/NREL/EnergyPlus/blob/develop/idd/Energy%2B.schema.epJSON`
  (pick a tagged release rather than `develop` for stability).
- **Build the app to ingest this file directly** (fetched at build time, or
  bundled and swappable) rather than re-encoding field lists by hand. This
  guarantees completeness (700+ object types) and lets the app stay current
  by swapping in a new schema file for a new EnergyPlus version.
- Custom keywords to handle: `legacy_idd`, `extensible`, `format`
  (e.g. `singleLine`), `default`, `anyOf` (autosizable/autocalculable fields:
  `{"type": "number"} | {"type": "string", "enum": ["Autosize"]}`),
  `object-list` / `reference` / `reference-class-name` (cross-object name
  references), `minimum`/`maximum` with `exclusiveMinimum`/`exclusiveMaximum`,
  `type: array` with `items` for extensible groups, and `required`.

---

## MODE 1: Basic (Wizard) — build this first

Goal: a user with no EnergyPlus knowledge answers a short sequence of
screens and gets a valid, runnable epJSON file. Every wizard screen writes
into the same underlying epJSON document (visible/editable later in Expert
mode) — the wizard is a generator, not a separate data model.

### Wizard steps

1. **Project setup**
   - Building name.
   - North axis orientation (compass rotation of the building), default 0.
   - Terrain type: pick from `Country` / `Suburbs` / `City` / `Ocean` /
     `Urban` (maps directly to `Building.terrain`).
   - → generates `Building`, `SimulationControl`, `Timestep` (default 6/hr),
     `HeatBalanceAlgorithm` (default CTF) with sensible defaults, no user
     input needed beyond what's asked.

2. **Location & climate**
   - Let the user search/pick a location (city or lat/long), or upload/pick
     an `.epw` weather file.
   - If only a location is picked (no EPW upload), pull representative design
     day and site data — either bundle a small curated set of common EPW
     files, or fetch design day values from a public source (e.g. ASHRAE
     climate design data, or the EnergyPlus weather file repository at
     https://energyplus.net/weather or https://climate.onebuilding.org).
   - → generates `Site:Location`, `SizingPeriod:DesignDay` (winter + summer
     design days), ground temperature objects with typical climate defaults,
     and stores a reference to the chosen EPW filename for the run.

3. **Run period**
   - Simple choice: "Full year" (default) or a specific date range.
   - → generates `RunPeriod`.

4. **Geometry — box model (this version's scope)**
   - Inputs: footprint width (X), footprint depth (Y), number of floors,
     floor-to-floor height, optional footprint orientation/rotation.
   - Optional simple refinements: flat vs. simple gable roof (flat only for
     v1 is fine), whether the ground floor is slab-on-grade vs. above grade.
   - Generate **one thermal zone per floor** as a rectangular box:
     - `Zone` per floor.
     - `BuildingSurface:Detailed` (or the simpler `Wall:Exterior` /
       `Floor:GroundContact` / `Ceiling:Adiabatic` / `Roof` convenience
       objects) for 4 walls + floor + ceiling/roof per zone, computed from
       the box dimensions — floor and roof only exposed on the bottom/top
       zone, interzone floor/ceiling pairs between stacked zones.
     - `GlobalGeometryRules` (required object, one per file, fixed sensible
       values e.g. `UpperLeftCorner`, `Counterclockwise`, `Relative`).
   - This is a pure geometry-generation function: `generateBoxGeometry(width,
depth, floors, floorHeight, ...) -> epJSON object fragments`. Keep it
     isolated so it can later be swapped for a polygon/footprint-drawing tool
     without touching the rest of the wizard.

5. **Envelope / constructions**
   - Instead of asking about material conductivity directly, offer a small
     **template library** keyed by climate zone + vintage (e.g. "ASHRAE
     90.1-2019, Climate Zone 4, exterior wall/roof/floor/window template"),
     or a simpler v1: 3-4 named presets ("Lightweight / Standard / Well
     insulated") each mapping to pre-defined `Material` + `Construction`
     objects with reasonable R-values.
   - → generates `Material`, `Construction` objects and assigns them as the
     `construction_name` for the generated surfaces.

6. **Windows**
   - Simple input: window-to-wall ratio (%) per facade or a single overall
     value, and a glazing template pick (e.g. "single pane / double pane /
     double pane low-E").
   - → generates window surfaces (via `Window` convenience object attached to
     each exterior wall) sized from the WWR, plus `WindowMaterial:
SimpleGlazingSystem` + `Construction` for the chosen glazing template.

7. **Internal loads & schedules**
   - Building-use template picker (Office / Residential / Retail / School /
     Warehouse — start with 2-3 templates for v1).
   - Each template bundles: occupancy density, lighting power density,
     equipment power density, and standard operating `Schedule:Compact`
     definitions (occupied hours, etc.) — generates `People`, `Lights`,
     `ElectricEquipment`, `ScheduleTypeLimits`, `Schedule:Compact` objects
     applied to the generated `ZoneList`.

8. **HVAC**
   - v1 default and only option: `ZoneHVAC:IdealLoadsAirSystem` per zone
     (EnergyPlus's "assume ideal heating/cooling capacity" system) plus the
     required `ZoneHVAC:EquipmentList` / `ZoneHVAC:EquipmentConnections`
     plumbing objects, with a simple heating/cooling setpoint schedule input
     (e.g. two numbers: heating setpoint, cooling setpoint) driving
     `ThermostatSetpoint:DualSetpoint` + `ZoneControl:Thermostat`.
   - Note in the UI that this models the _load_, not real equipment
     performance — real HVAC systems (packaged RTU, VAV, etc.) are a
     later/expert-mode feature.

9. **Outputs**
   - Checkbox list of common reports mapped to `Output:Variable`/
     `Output:Meter`/`Output:Table:SummaryReports` entries: e.g. "Zone Energy
     Use Summary," "Comfort (temperature/humidity)," "Monthly utility bills
     estimate." Default a sensible minimal set even if the user checks
     nothing (at least `Output:Table:SummaryReports` with `AllSummary`).

10. **Review & generate**
    - Show a plain-language summary of the choices made (not raw JSON) plus
      an option to view the generated epJSON.
    - "Open in Expert mode" button to jump straight into the full editor on
      this generated document.
    - Export `.epJSON` file. (Actually running the simulation via the
      EnergyPlus executable is out of scope for this version — see Non-goals.)

### Wizard implementation notes

- Structure each step as a pure function: `(userInputs) -> partial epJSON
fragment`, merged into one document at the end (or incrementally after each
  step, so switching to Expert mode mid-wizard shows a valid partial file).
- Validate each generated fragment against the real JSON Schema as it's
  produced — the wizard should never be able to emit something that fails
  schema validation. Treat schema validation failures during generation as
  bugs in the generator, not user-facing errors.
- Keep the template libraries (constructions, glazing, building-use loads,
  weather/design-day defaults) as clearly separated, swappable data files —
  this is where the most future iteration will happen (more templates, more
  climate zones, real EPW ingestion) and it should not be tangled with the
  wizard UI code.

---

## MODE 2: Expert — full schema-driven editor

1. **File management** — new file, open/import an existing `.epJSON` file
   (including one generated by the Basic wizard), save/export.

2. **Schema-driven object browser**
   - Sidebar listing all object types available in the loaded schema, grouped
     by category (Simulation Parameters, Location and Climate, Schedules,
     Surface Construction Elements, Thermal Zones and Surfaces, Internal
     Gains, HVAC, Output, etc.).
   - Search/filter by object type name; show instance counts per type.

3. **Schema-driven form editor**
   - Selecting an object type lists its named instances; selecting/creating
     an instance renders a form generated from that object's JSON Schema
     fragment:
     - Correct widget per field type (number, integer, text, enum dropdown,
       Yes/No toggle, Autosize/Autocalculate-vs-numeric switch).
     - Required fields visibly marked; blocks save until filled, with inline
       errors.
     - Defaults pre-filled/greyed when a field is empty; units and
       descriptions shown as help text from the schema.
     - Extensible array fields as a repeatable table (add/remove/reorder
       rows) — e.g. surface vertices, schedule day/value pairs.
     - Reference (`object-list`) fields as a searchable autocomplete
       populated from existing matching objects, with inline "create new"
       if the target doesn't exist yet.
   - Duplicate/clone an instance; rename with optional propagation of the
     rename to every object referencing the old name.

4. **Raw JSON view** — syntax-highlighted, formatted JSON (Monaco/CodeMirror)
   for the whole file or the selected object, kept in sync with the form
   view, validated on edit.

5. **Validation**
   - Validate against the loaded JSON Schema (e.g. `ajv`) on every change and
     before export; surface errors per object/field.
   - Best-effort cross-reference check: flag `object-list` fields whose value
     doesn't match the name of any existing object of the expected type/class.

6. **Quality-of-life** — undo/redo, duplicate-name detection within a type,
   diff/preview before overwriting an imported file, autosave to local
   storage.

---

## Suggested architecture

- Frontend-only SPA is sufficient for this version — no simulation is being
  run, just authoring a JSON file. React + TypeScript.
- Load `Energy+.schema.epJSON` as a static asset (pin one EnergyPlus version);
  optionally support uploading a different schema file for other versions.
- `ajv` (+ `ajv-formats` if needed) for schema validation.
- Write a small custom "JSON-Schema-fragment → form field spec" mapper for
  the Expert-mode form generator, rather than relying on a generic
  do-everything JSON-schema-form library — epJSON's custom keywords
  (`extensible`, `object-list`, autosize `anyOf`) need special-cased
  rendering that generic libraries won't get right out of the box, though you
  can start from one (e.g. react-jsonschema-form) and layer custom field
  templates for these cases.
- Monaco Editor or CodeMirror 6 for the raw JSON view.
- State management: React context + `useReducer`, or Zustand — this doesn't
  need Redux-scale infrastructure.
- Keep the Basic-mode generator functions (geometry, construction templates,
  load templates, weather/design-day defaults) in their own modules, decoupled
  from both the wizard UI and the Expert-mode editor, since both modes read
  and write the same underlying document via a shared epJSON data layer.

## Non-goals (explicitly out of scope unless I ask later)

- Do not implement the actual EnergyPlus simulation engine or call out to it
  — this app produces the input file only.
- Do not implement polygon/footprint drawing or non-rectangular geometry yet
  — box/shoebox geometry only for this version.
- Do not implement real HVAC system templates (VAV, packaged RTU, etc.) yet
  — `ZoneHVAC:IdealLoadsAirSystem` only for this version.
- Do not try to support the legacy IDF text format — epJSON only.

## Deliverable

Start by:

1. Fetching/confirming the structure of `Energy+.schema.epJSON` for a
   specific EnergyPlus version (ask me which version if unspecified, or
   default to the latest stable release) and summarizing its shape (top-level
   keys, a couple of representative object definitions, how
   `extensible`/`object-list`/autosize `anyOf` actually appear in practice).
2. Proposing a concrete file/folder structure, the field-type-to-widget
   mapping table for Expert mode, and the exact epJSON object list the Basic
   wizard's box-geometry generator will need to emit for a single-zone box —
   confirm this before writing the full app.
3. Then build incrementally: schema loader/validator → Basic-mode box
   geometry generator + wizard steps 1-3 → construction/glazing/load
   templates (steps 5-7) → HVAC + outputs (steps 8-9) → review/export (step 10) → Expert-mode object browser and dynamic form renderer → raw JSON
   view → cross-reference autocomplete → polish.

### Simular no serviço de homologação

Use **Simular modelo** no cabeçalho ou na revisão. Sem sessão, o painel pede
login com e-mail e senha (T032, ADR-0004). Com sessão, ele conecta sozinho,
traz o motor e o clima escolhidos e acompanha a execução até **Analisar
resultados**.
