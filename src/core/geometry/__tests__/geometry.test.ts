import { describe, expect, it } from 'vitest';
import { loadTestSchema } from '@/core/testSchema';
import { checkCrossReferences } from '@/core/validation/crossRefs';
import { templates } from '@/templates';
import { defaultAnswers } from '@/generators/answers';
import { generateDocument } from '@/generators/compose';
import { importLibraryConstruction } from '@/generators/library';
import { isFrameRectangle, localBounds, planeFrame, rectVertices, toLocal } from '../frames';
import { readGeometryModel } from '../model';
import { addOpening, boxDims, checkOpening, constructionLayers, editConstruction, materialWithThickness, moveOpening, resizeZoneBox, sameFootprintZones, zoneBox } from '../edits';
import type { Vec3 } from '../vec';

const { validator, index } = loadTestSchema();

function doc(floors = 1) {
  const a = defaultAnswers();
  a.windows.automatic = true;
  a.geometry.floors = floors;
  return generateDocument(a, templates).document;
}

function expectValid(d: ReturnType<typeof doc>) {
  expect(validator.validate(d)).toEqual([]);
  expect(checkCrossReferences(d, index)).toEqual([]);
}

describe('frames', () => {
  it('builds right-handed frames seen from outside for walls, roofs and floors', () => {
    const south: Vec3[] = [[0, 0, 3], [0, 0, 0], [10, 0, 0], [10, 0, 3]];
    const f = planeFrame(south)!;
    expect(f.u).toEqual([1, 0, 0]);
    expect(f.v.map(Math.round)).toEqual([0, 0, 1]);
    expect(isFrameRectangle(f, south)).toBe(true);
    expect(localBounds(f, south)).toEqual({ x: 0, y: 0, width: 10, height: 3 });

    const north: Vec3[] = [[10, 8, 3], [10, 8, 0], [0, 8, 0], [0, 8, 3]];
    const fn = planeFrame(north)!;
    expect(fn.u.map(Math.round)).toEqual([-1, 0, 0]);
    expect(toLocal(fn, [10, 8, 0])).toEqual([0, 0]);

    const roof: Vec3[] = [[0, 8, 3], [0, 0, 3], [10, 0, 3], [10, 8, 3]];
    expect(planeFrame(roof)!.n).toEqual([0, 0, 1]);
    const floor: Vec3[] = [[0, 0, 0], [0, 8, 0], [10, 8, 0], [10, 0, 0]];
    expect(planeFrame(floor)!.n).toEqual([0, 0, -1]);
  });

  it('orders rectangle corners according to the geometry rules', () => {
    const f = planeFrame([[0, 0, 3], [0, 0, 0], [10, 0, 0], [10, 0, 3]])!;
    const r = { x: 1, y: 1, width: 2, height: 1 };
    expect(rectVertices(f, r, { start: 'UpperLeftCorner', counterclockwise: true }).map((p) => p.map(Math.round))).toEqual([[1, 0, 2], [1, 0, 1], [3, 0, 1], [3, 0, 2]]);
    expect(rectVertices(f, r, { start: 'LowerLeftCorner', counterclockwise: false })[0].map(Math.round)).toEqual([1, 0, 1]);
  });
});

describe('geometry model', () => {
  it('reads surfaces, openings and their positions', () => {
    const m = readGeometryModel(doc());
    const wall = m.surfaces.get('Pavimento 1 - Parede Sul')!;
    expect(wall.category).toBe('Wall');
    expect(wall.rect).toEqual({ x: 0, y: 0, width: 10, height: 3 });
    expect(wall.subsurfaces).toHaveLength(1);
    const win = m.subsurfaces.get(wall.subsurfaces[0])!;
    expect(win.category).toBe('Window');
    expect(win.rect!.width * win.rect!.height).toBeCloseTo(6, 3);
    expect(zoneBox(m, 'Pavimento 1')).toEqual({ min: [0, 0, 0], max: [10, 8, 3] });
  });
});

describe('edits', () => {
  it('adds, moves and validates doors and windows', () => {
    let d = doc();
    d = importLibraryConstruction(d, templates, 'door:madeira').doc;
    let m = readGeometryModel(d);
    const r = addOpening(d, m, 'Pavimento 1 - Parede Norte', { category: 'Door', rect: { x: 1, y: 0, width: 0.9, height: 2.1 }, construction: 'Porta - Porta de madeira maciça' });
    d = r.doc;
    expectValid(d);
    m = readGeometryModel(d);
    const door = m.subsurfaces.get(r.name)!;
    expect(door.rect).toEqual({ x: 1, y: 0, width: 0.9, height: 2.1 });
    const base = m.surfaces.get('Pavimento 1 - Parede Norte')!;
    expect(checkOpening(m, base, door.rect!, r.name)).toEqual([]);
    expect(checkOpening(m, base, { x: 9.5, y: 0, width: 1, height: 2 }, r.name)[0]).toMatch(/limites/);
    // Overlaps the generated centered window
    expect(checkOpening(m, base, { x: 4.5, y: 1, width: 1, height: 1 }, r.name).some((p) => p.startsWith('Sobrepõe'))).toBe(true);

    d = moveOpening(d, m, r.name, { x: 7, y: 0, width: 1, height: 2.2 });
    expect(readGeometryModel(d).subsurfaces.get(r.name)!.rect).toEqual({ x: 7, y: 0, width: 1, height: 2.2 });
    expectValid(d);
  });

  it('resizes box zones on all floors and shifts floors above', () => {
    let d = doc(3);
    const m = readGeometryModel(d);
    expect(sameFootprintZones(m, 'Pavimento 1')).toEqual(['Pavimento 1', 'Pavimento 2', 'Pavimento 3']);
    d = resizeZoneBox(d, 'Pavimento 2', { width: 12, depth: 6, height: 3.5 }, true);
    expectValid(d);
    const m2 = readGeometryModel(d);
    expect(boxDims(zoneBox(m2, 'Pavimento 1')!)).toEqual({ width: 12, depth: 6, height: 3 });
    expect(boxDims(zoneBox(m2, 'Pavimento 2')!)).toEqual({ width: 12, depth: 6, height: 3.5 });
    expect(d.Zone['Pavimento 3'].z_origin).toBe(6.5);
    // Windows stay inside their walls
    for (const sub of m2.subsurfaces.values()) {
      const base = m2.surfaces.get(sub.base)!;
      expect(checkOpening(m2, base, sub.rect!, sub.name)).toEqual([]);
    }
  });

  it('edits construction thickness for all users or a single surface', () => {
    let d = doc();
    const wall = 'Parede externa - Padrão';
    const layers = constructionLayers(d, wall);
    const r = materialWithThickness(d, layers[1], 0.14);
    d = r.doc;
    expect(r.name).toBe('Bloco cerâmico (camada equivalente) 14 cm');
    const only = editConstruction(d, wall, [layers[0], r.name, layers[2]], { mode: 'only', element: 'Pavimento 1 - Parede Sul' });
    d = only.doc;
    expect(d['BuildingSurface:Detailed']['Pavimento 1 - Parede Sul'].construction_name).toBe(only.construction);
    expect(d['BuildingSurface:Detailed']['Pavimento 1 - Parede Leste'].construction_name).toBe(wall);
    expect(constructionLayers(d, wall)[1]).toBe(layers[1]);
    expectValid(d);
    const all = editConstruction(d, wall, [layers[0], r.name], { mode: 'all' });
    expect(constructionLayers(all.doc, wall)).toEqual([layers[0], r.name]);
    expect(all.doc.Construction[wall].layer_3).toBeUndefined();
  });
});
