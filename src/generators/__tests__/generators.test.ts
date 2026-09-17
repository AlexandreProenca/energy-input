import { describe, expect, it } from 'vitest';
import { loadTestSchema } from '@/core/testSchema';
import { checkCrossReferences, checkDuplicateNames } from '@/core/validation/crossRefs';
import { templates } from '@/templates';
import { defaultAnswers, type WizardAnswers } from '../answers';
import { generateDocument } from '../compose';
import { generateBoxGeometry, polygonNormal, type Vec3 } from '../geometry/boxGeometry';
import { sizeWindow } from '../windows';
import { assemblyThermal } from '../envelope';
import { weeklyProfile } from '../schedules';

const { validator, index } = loadTestSchema();

function expectValid(answers: WizardAnswers) {
  const { document } = generateDocument(answers, templates);
  const errors = validator.validate(document);
  expect(errors, JSON.stringify(errors, null, 1)).toEqual([]);
  const refs = checkCrossReferences(document, index);
  expect(refs, JSON.stringify(refs, null, 1)).toEqual([]);
  expect(checkDuplicateNames(document)).toEqual([]);
  return document;
}

const vertsOf = (s: { vertices: { vertex_x_coordinate: number; vertex_y_coordinate: number; vertex_z_coordinate: number }[] }): Vec3[] =>
  s.vertices.map((v) => [v.vertex_x_coordinate, v.vertex_y_coordinate, v.vertex_z_coordinate]);

describe('box geometry', () => {
  const constructions = { wall: 'W', roof: 'R', groundFloor: 'G', interFloor: 'IF', interCeiling: 'IC' };

  it('emits 6 surfaces for a single zone with outward normals', () => {
    const { fragment, zones } = generateBoxGeometry({ width: 10, depth: 8, floors: 1, floorHeight: 3, groundFloor: 'slab', constructions });
    const surfaces = fragment['BuildingSurface:Detailed'] as Record<string, never>;
    expect(Object.keys(surfaces)).toHaveLength(6);
    expect(zones[0].floorArea).toBe(80);
    const center: Vec3 = [5, 4, 1.5];
    for (const s of Object.values(surfaces)) {
      const pts = vertsOf(s);
      const n = polygonNormal(pts);
      const c = pts.reduce<Vec3>((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
      const out = (c[0] - center[0]) * n[0] + (c[1] - center[1]) * n[1] + (c[2] - center[2]) * n[2];
      expect(out).toBeGreaterThan(0);
    }
  });

  it('pairs interzone floors and ceilings', () => {
    const { fragment } = generateBoxGeometry({ width: 6, depth: 6, floors: 3, floorHeight: 3, groundFloor: 'raised', constructions });
    const s = fragment['BuildingSurface:Detailed'] as Record<string, Record<string, unknown>>;
    expect(Object.keys(s)).toHaveLength(18);
    expect(s['Pavimento 2 - Piso'].outside_boundary_condition_object).toBe('Pavimento 1 - Forro');
    expect(s['Pavimento 1 - Forro'].outside_boundary_condition_object).toBe('Pavimento 2 - Piso');
    expect(s['Pavimento 1 - Piso'].outside_boundary_condition).toBe('Outdoors');
    expect(s['Pavimento 3 - Cobertura']).toBeDefined();
    expect(s['Pavimento 1 - Cobertura']).toBeUndefined();
    expect(() => generateBoxGeometry({ width: 0, depth: 6, floors: 1, floorHeight: 3, groundFloor: 'slab', constructions })).toThrow();
  });
});

describe('windows', () => {
  it('matches the requested WWR and stays within the wall', () => {
    for (const [L, H, wwr] of [[10, 3, 0.2], [8, 3, 0.4], [3, 2.7, 0.9], [20, 4, 0.6]]) {
      const r = sizeWindow(L, H, wwr)!;
      expect(r.x0).toBeGreaterThanOrEqual(0.09);
      expect(r.x0 + r.width).toBeLessThanOrEqual(L - 0.09);
      expect(r.sill + r.height).toBeLessThanOrEqual(H - 0.04);
      if (wwr <= 0.6) expect(r.actualWwr).toBeCloseTo(wwr, 2);
    }
    expect(sizeWindow(10, 3, 0)).toBeUndefined();
  });
});

describe('templates', () => {
  it('standard wall has a plausible U-value', () => {
    const preset = templates.constructionPresets.find((p) => p.id === 'padrao')!;
    const t = assemblyThermal('wall', preset.assemblies.wall.layers, templates.materials);
    expect(t.uValue).toBeGreaterThan(2);
    expect(t.uValue).toBeLessThan(3);
  });
  it('expands weekly profiles', () => {
    const office = templates.buildingUses.find((u) => u.id === 'escritorio')!;
    const w = weeklyProfile(office.schedules.occupancy);
    expect(w[0][10]).toBe(0.95);
    expect(w[6][10]).toBe(0);
    expect(w[5][9]).toBe(0.3);
  });
});

describe('generated document', () => {
  it('default answers validate against the schema with no dangling references', () => {
    const doc = expectValid(defaultAnswers());
    expect(Object.keys(doc.Zone)).toEqual(['Pavimento 1']);
    expect(Object.keys(doc['FenestrationSurface:Detailed'])).toHaveLength(4);
  });

  it('every template combination validates', () => {
    for (const preset of templates.constructionPresets)
      for (const use of templates.buildingUses)
        for (const glazing of templates.glazing) {
          const a = defaultAnswers();
          a.envelope.presetId = preset.id;
          a.loads.useId = use.id;
          a.windows.glazingId = glazing.id;
          a.geometry.floors = 3;
          a.geometry.groundFloor = 'raised';
          a.hvac.setbackEnabled = true;
          a.outputs.selected = templates.outputs.map((o) => o.id);
          expectValid(a);
        }
  });

  it('handles per-facade WWR, no windows, date ranges and design-day runs', () => {
    const a = defaultAnswers();
    a.windows = { mode: 'perFacade', wwr: 0, perFacade: { north: 40, south: 0, east: 10, west: 0 }, glazingId: 'duplo' };
    a.runPeriod = { mode: 'range', beginMonth: 2, beginDay: 30, endMonth: 3, endDay: 15 };
    let doc = expectValid(a);
    expect(Object.keys(doc['FenestrationSurface:Detailed'])).toHaveLength(2);
    expect(doc.RunPeriod['Período personalizado'].begin_day_of_month).toBe(28);

    a.windows.mode = 'uniform';
    a.windows.wwr = 0;
    a.runPeriod.mode = 'designDays';
    doc = expectValid(a);
    expect(doc['FenestrationSurface:Detailed']).toBeUndefined();
    expect(doc.SimulationControl['SimulationControl 1'].run_simulation_for_sizing_periods).toBe('Yes');
  });

  it('every bundled city validates', () => {
    for (const city of templates.cities) {
      const a = defaultAnswers();
      a.location.cityId = city.id;
      expectValid(a);
    }
  });
});
