# Energy Input — development notes

Web app (pt-BR UI) for creating/editing EnergyPlus **epJSON** files. Frontend-only: React 18 + TypeScript + Vite 6, Zustand, ajv 8, CodeMirror 6, react-three-fiber.

```bash
npm install
npm run dev          # builds public/schema from schema/<version>/ then starts Vite
npm test             # vitest: schema mapping, validation, generators, wizard sync
npm run build
```

## Schema (source of truth)

- `schema/26.1/Energy+.schema.epJSON` — vendored from the **EnergyPlus v26.1.0** release package. It is generated at EnergyPlus build time and is *not* in the GitHub repo, so `npm run fetch-schema -- v26.1.0` extracts it from the release tarball.
- `npm run schema` (runs automatically) writes `public/schema/<version>/schema.json`: the same JSON Schema minus `legacy_idd`, plus `field_order` / `field_labels` taken from it. Several versions can live side by side; the newest is the default. Users can also upload a schema at runtime (Expert mode → "Schema").
- Validation compiles each object type's sub-schema lazily in ajv (the full schema takes >1 s to compile; it has no `$ref`s, so sub-schemas are self-contained).

## Layout

```
src/core/          framework-free, unit tested
  epjson/          document types + immutable ops (rename w/ propagation, clone, diff, ordering)
  schema/          SchemaIndex, JSON-Schema fragment → FieldSpec mapper, slim schema
  validation/      ajv wrapper with pt-BR messages, cross-reference + duplicate-name checks
  weather/         EPW parser, DDY (IDF) parser, design-day/ground-temperature estimates
  sync/            wizard ⇄ document merge (ownership hashes, conflict detection)
  geometry/        read model (frames, rectangles, zones), pure edits (openings, zone box resize,
                   construction layers/thickness with "all users" vs "only this element" scope), U/CT summary
src/generators/    pure step generators: (answers) → epJSON fragment; compose.ts merges them
  geometry/boxGeometry.ts   isolated box geometry (swap for a polygon tool later)
src/templates/     swappable DATA: cities (built by `npm run climates`), materials & construction
                   presets, colors, glazing, building uses (schedules), output presets
src/store/         zustand: schema, document (undo/redo), wizard, ui, autosave (localStorage)
src/features/      wizard/ (steps, illustrations), geometry/ (Editor 3D), expert/ (sidebar, list, form, fields, JSON), preview/ (3D)
scripts/           build-schema, fetch-schema, build-climates, eplus-check
```

## Field kind → widget (Expert mode)

| Schema pattern | FieldSpec kind | Widget |
|---|---|---|
| `type: number` / `integer` | `number` / `integer` | numeric input (pt-BR comma), unit, range hint |
| string, no enum | `text` | text input |
| enum `"" / Yes / No` | `yesno` | Padrão · Sim · Não |
| other enum | `enum` | select (combobox when >12 options) |
| `anyOf` number \| Autosize/Autocalculate | `autoNumber` | Padrão · Auto · Valor + number |
| `anyOf` number \| string | `numberOrText` | free input, numbers coerced |
| `anyOf` integer enum \| `""` | `numericEnum` | select |
| `data_type: object_list` | `reference` | searchable picker from document names, "Criar …", dangling warning |
| object_list naming `reference-class-name` | `classReference` | picker of object type names |
| `data_type: external_list` | `externalList` | free text + suggestions |
| `type: array` + `items` | `array` | editable table: add/remove/reorder, paste from spreadsheet |

## Wizard ⇄ Expert

Every wizard answer has a default and the whole document is regenerated on each change. `planWizardSync` applies it without clobbering manual edits: it stores a hash of every object the wizard wrote; objects the user changed are kept silently when the wizard's version didn't change, and raise a "Manter / Sobrescrever" dialog when it did. Objects the user created are never removed. Opening or creating a file in Expert mode unlinks the wizard.

## Editor 3D

Third mode, editing the same document. `core/geometry/model.ts` reads `BuildingSurface:Detailed` (and `Wall/RoofCeiling/Floor:Detailed`) plus `FenestrationSurface:Detailed`, building a frame per surface (u right, v up, n outward, seen from outside) so rectangles and openings get 2D coordinates. Writes honor `GlobalGeometryRules` (start corner, direction, Relative/World).

- Selection by clicking meshes (drag-aware) or the element tree; walls are extruded inward by their construction thickness with real holes for openings.
- Surfaces: construction picker (document + library, imported on demand), layer editor (material, thickness, order); shared constructions ask whether to edit all users or copy for this element. Thickness changes create material variants ("… 19 cm").
- Walls/zones: box-shaped zones can be resized (optionally all floors with the same footprint; height shifts floors above); openings keep size and are repositioned proportionally.
- Openings: window / door / glass door, numeric position (from the wall's lower-left seen from outside) or drag/resize on the SVG elevation (5 cm snap), overlap/out-of-wall checks.
- Door templates live in `src/templates/doors/`.

EnergyPlus surfaces have no thickness: thickness only affects heat transfer through the construction.

## Verifying generated files with EnergyPlus

`scripts/eplus-check.ts` generates several variants and runs them through a local EnergyPlus install, failing on Severe/Fatal errors (dev only — the app never runs EnergyPlus):

```bash
EPLUS_DIR=/Applications/EnergyPlus-26-1-0 EPW=path/to/city.epw npm run eplus-check
```

All variants (1–3 floors, all presets, per-facade windows, setbacks, year-wrapping run period, design-day-only, and a document edited with the 3D editor operations: resized zones, door/glass door/window added, per-wall thickness) complete with 0 severe errors on EnergyPlus 26.1.0.

## Docker

Build multi-stage: `node:20-alpine` gera o `dist/` (schema + typecheck + build do Vite), servido depois por `nginx:1.27-alpine`. A imagem final não carrega Node nem `node_modules` — só os arquivos estáticos e o nginx (~56 MB).

```bash
docker compose up --build       # http://localhost:8080
# ou, sem compose:
docker build -t energy-input .
docker run -p 8080:80 energy-input
```

Não há variáveis de ambiente nem backend: é um SPA 100% estático, e o schema do EnergyPlus é gerado dentro da imagem a partir de `schema/26.1/Energy+.schema.epJSON` (por isso esse arquivo vendorizado precisa estar no contexto de build). `docker/nginx.conf` cuida de gzip, cache longo e imutável para `/assets/*` (nomes com hash do Vite), cache curto com revalidação para `/schema/*` e `no-cache` para `index.html`, além de um fallback de SPA (`try_files … /index.html`) — hoje sem uso real, já que não há roteamento client-side, mas inofensivo e já pronto caso isso mude.

Para atualizar a versão do EnergyPlus na imagem, rode `npm run fetch-schema -- vXX.Y.0` localmente (grava em `schema/<versão>/`) antes do build — o Dockerfile não busca nada da rede.

## Known simplifications

- Bioclimatic zones (NBR 15220-3) per city are approximate and user-adjustable; NBR 15575 badges are indicative only.
- Santa Maria, Caxias do Sul and Pelotas DDY files lack ASHRAE conditions; their design days are estimated from the EPW.
- `Site:GroundTemperature:BuildingSurface` uses a damped monthly mean clamped to 15–25 °C (no slab preprocessor).
- Facade names (Norte/Sul/…) follow model axes; with a non-zero north axis they are rotated.
