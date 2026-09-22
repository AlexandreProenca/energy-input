import { describe, expect, it } from 'vitest';
import { defaultAnswers } from '@/generators/answers';
import { generateDocument } from '@/generators/compose';
import { templates } from '@/templates';
import { readGeometryModel } from '../model';
import { findSharedSurfaces, type SharedCandidate } from '../sharedSurfaces';
import { addOpening, checkOpening, deleteOpening, moveOpening, setOpeningCategory, vertexArray, constructionLayers, editConstruction, setSurfaceConstruction } from '../edits';
import { buildMeshes } from '@/features/geometry/Scene3D';
import { importLibraryConstruction } from '@/generators/library';
import { summarizeConstruction } from '../thermal';
import { loadTestSchema } from '@/core/testSchema';
import { checkCrossReferences } from '@/core/validation/crossRefs';
import type { Vec3 } from '../vec';

function document() {
  const a = defaultAnswers();
  a.project.northAxis = 27;
  a.geometry = { ...a.geometry, floors: 2, mode: 'plan', rooms: [
    { id: 'a', name: 'A', points: [[0, 0], [4, 0], [4, 4], [0, 4]] },
    { id: 'b', name: 'B', points: [[4, 0], [7, 0], [7, 2], [4, 2]] },
    { id: 'c', name: 'C', points: [[4, 2], [7, 2], [7, 4], [4, 4]] },
  ] };
  return generateDocument(a, templates).document;
}
const { validator, index } = loadTestSchema();
function valid(d: ReturnType<typeof document>) {
  expect(validator.validate(d)).toEqual([]);
  expect(checkCrossReferences(d, index)).toEqual([]);
}

describe('superfícies físicas compartilhadas', () => {
  it('reconhece paredes divididas em encontros T e lajes entre pavimentos pelos pontos globais', () => {
    const d = document(), m = readGeometryModel(d);
    const paired = [...m.surfaces.values()].filter(s => s.sharedWith);
    expect(paired.filter(s => s.category === 'Wall')).toHaveLength(12);
    expect(paired.filter(s => s.category !== 'Wall')).toHaveLength(6);
    for (const s of paired) {
      expect(m.surfaces.get(s.sharedWith!)?.sharedWith).toBe(s.name);
      expect(s.boundaryObject).toBe(s.sharedWith);
    }
    // Detection must work without trusting boundary reference names.
    for (const s of Object.values(d['BuildingSurface:Detailed'])) delete s.outside_boundary_condition_object;
    expect([...readGeometryModel(d).surfaces.values()].filter(s => s.sharedWith)).toHaveLength(18);
  });

  it('desenha cada par uma única vez com a espessura total correta', () => {
    const d = document(), m = readGeometryModel(d), meshes = buildMeshes(d, m, true);
    expect(meshes.length).toBe(m.surfaces.size - 9);
    const shared = meshes.filter(b => b.faces?.length === 2);
    expect(shared).toHaveLength(9);
    for (const b of shared) {
      const s = b.faces![0], t = b.faces![1];
      expect(t.name).toBe(s.sharedWith);
      const origin = m.toWorld([0, 0, 0], s.zone), end = m.toWorld(s.frame!.n, s.zone);
      const n = [end[0] - origin[0], end[2] - origin[2], -(end[1] - origin[1])];
      const positions = b.geometry.getAttribute('position');
      const projections = Array.from({ length: positions.count }, (_, i) => positions.getX(i) * n[0] + positions.getY(i) * n[1] + positions.getZ(i) * n[2]);
      const thickness = summarizeConstruction(d, constructionLayers(d, s.construction!), s.category).thickness;
      expect(Math.max(...projections) - Math.min(...projections)).toBeCloseTo(thickness, 5);
      const p = m.toWorld(s.points[0], s.zone);
      expect((Math.max(...projections) + Math.min(...projections)) / 2).toBeCloseTo(p[0] * n[0] + p[2] * n[1] - p[1] * n[2], 5);
    }
    meshes.forEach(b => { b.geometry.dispose(); b.edges.dispose(); });
  });

  it('tolera origem, ordem e pontos colineares diferentes, sem unir faces apenas próximas', () => {
    const points: Vec3[] = [[0, 0, 0], [4, 0, 0], [4, 0, 3], [0, 0, 3]];
    const a: SharedCandidate = { name: 'a', zone: 'A', category: 'Wall', points };
    const b: SharedCandidate = { name: 'b', zone: 'B', category: 'Wall', points: [[4, 0, 3], [4, 0, 0], [2, 0, 0], [0, 0, 0], [0, 0, 3]] };
    expect(findSharedSurfaces([a, b]).get('a')).toBe('b');
    expect(findSharedSurfaces([a, { ...b, points: b.points.map(([x, y, z]) => [x, y + 0.001, z]) }]).size).toBe(0);
    expect(findSharedSurfaces([a, { ...b, points }]).size).toBe(0);
    expect(findSharedSurfaces([a, { ...b, zone: 'A' }]).size).toBe(0);
    expect(findSharedSurfaces([a, b, { ...b, name: 'c', zone: 'C' }]).size).toBe(0);
  });

  it('considera a translação e rotação de cada zona ao comparar as faces', () => {
    const a = defaultAnswers(); a.geometry.floors = 2;
    const d = generateDocument(a, templates).document;
    expect(readGeometryModel(d).surfaces.get('Pavimento 1 - Forro')?.sharedWith).toBe('Pavimento 2 - Piso');
    d.Zone['Pavimento 2'].direction_of_relative_north = 180;
    d.Zone['Pavimento 2'].x_origin = a.geometry.width;
    d.Zone['Pavimento 2'].y_origin = a.geometry.depth;
    expect(readGeometryModel(d).surfaces.get('Pavimento 1 - Forro')?.sharedWith).toBe('Pavimento 2 - Piso');
    d.Zone['Pavimento 2'].z_origin = 3.01;
    expect(readGeometryModel(d).surfaces.get('Pavimento 1 - Forro')?.sharedWith).toBeUndefined();
  });

  it('mantém material e camadas inversas dos dois lados ao editar só o elemento ou todos', () => {
    let d = document();
    const m = readGeometryModel(d);
    const s = [...m.surfaces.values()].find(s => s.category === 'Wall' && s.sharedWith)!;
    const layers = constructionLayers(d, s.construction!);
    // Asymmetric order makes the reverse test meaningful.
    const changed = [layers[0], layers[1]];
    const r = editConstruction(d, s.construction!, changed, { mode: 'only', element: s.name }); d = r.doc;
    let other = d['BuildingSurface:Detailed'][s.sharedWith!].construction_name as string;
    expect(constructionLayers(d, other)).toEqual([...changed].reverse()); valid(d);
    d = editConstruction(d, r.construction, [...changed, layers[0]], { mode: 'all' }).doc;
    other = d['BuildingSurface:Detailed'][s.sharedWith!].construction_name as string;
    expect(constructionLayers(d, other)).toEqual([layers[0], ...changed.reverse()]); valid(d);
    const roof = Object.keys(d.Construction).find(n => n.startsWith('Cobertura'))!;
    d = setSurfaceConstruction(d, readGeometryModel(d), s.sharedWith!, roof);
    const opposite = d['BuildingSurface:Detailed'][s.name].construction_name as string;
    expect(constructionLayers(d, opposite)).toEqual(constructionLayers(d, roof).reverse()); valid(d);
  });
});


describe('aberturas em paredes compartilhadas', () => {
  function setup() {
    let d = document();
    const door = importLibraryConstruction(d, templates, 'door:metalica'); d = door.doc;
    const glass = importLibraryConstruction(d, templates, 'glazing:duplo_lowe'); d = glass.doc;
    return { d, door: door.name, glass: glass.name };
  }
  function coincident(d: ReturnType<typeof document>, name: string) {
    const m = readGeometryModel(d), a = m.subsurfaces.get(name)!, b = m.subsurfaces.get(a.sharedWith!)!;
    expect(b.sharedWith).toBe(a.name);
    const pa = a.points.map(p => m.toWorld(p, m.surfaces.get(a.base)!.zone));
    const pb = b.points.map(p => m.toWorld(p, m.surfaces.get(b.base)!.zone));
    for (const p of pa) expect(pb.some(q => p.every((c, i) => Math.abs(c - q[i]) < 0.0002))).toBe(true);
    valid(d);
    return { m, a, b };
  }
  it('cria portas, janelas e portas de vidro nos trechos de três zonas, com uma malha por abertura', () => {
    let { d, door, glass } = setup();
    const walls = [...readGeometryModel(d).surfaces.values()].filter(s => s.category === 'Wall' && s.sharedWith);
    const seen = new Set<string>(); let count = 0;
    for (const wall of walls) {
      if (seen.has(wall.name)) continue;
      seen.add(wall.name); seen.add(wall.sharedWith!);
      const category = (['Door', 'Window', 'GlassDoor'] as const)[count % 3];
      const r = addOpening(d, readGeometryModel(d), wall.name, { category,
        construction: category === 'Door' ? door : glass,
        rect: { x: wall.rect!.x + 0.2, y: wall.rect!.y + 0.1, width: 0.6, height: 1.2 } });
      d = r.doc; coincident(d, r.name); count++;
    }
    const meshes = buildMeshes(d, readGeometryModel(d), true);
    expect(meshes.filter(b => b.kind === 'opening')).toHaveLength(count);
    expect(readGeometryModel(d).subsurfaces.size).toBe(count * 2);
    meshes.forEach(b => { b.geometry.dispose(); b.edges.dispose(); });
  });
  it('sincroniza movimento pela face oposta, tipo, material e exclusão sem referências quebradas', () => {
    let { d, door, glass } = setup();
    const m = readGeometryModel(d), wall = [...m.surfaces.values()].find(s => s.category === 'Wall' && s.sharedWith)!;
    const r = addOpening(d, m, wall.name, { category: 'Door', construction: door,
      rect: { x: wall.rect!.x + 0.2, y: wall.rect!.y + 0.1, width: 0.6, height: 1.2 } });
    d = r.doc;
    let pair = coincident(d, r.name);
    d = moveOpening(d, pair.m, pair.b.name, { ...pair.b.rect!, width: 0.5, height: 1.5 });
    pair = coincident(d, r.name);
    expect(pair.a.rect!.height).toBe(1.5);
    d = setOpeningCategory(d, pair.b.name, 'Window', glass);
    pair = coincident(d, r.name);
    expect(pair.a.category).toBe('Window');
    d = editConstruction(d, glass, constructionLayers(d, glass), { mode: 'only', element: r.name }).doc;
    pair = coincident(d, r.name);
    expect(constructionLayers(d, pair.b.construction!)).toEqual(constructionLayers(d, pair.a.construction!).reverse());
    d = deleteOpening(d, pair.b.name);
    expect(readGeometryModel(d).subsurfaces.size).toBe(0); valid(d);
  });
  it('transforma coordenadas entre zonas rotacionadas e impede sobreposição criada pelo outro lado', () => {
    let { d, door } = setup();
    let m = readGeometryModel(d);
    const wall = [...m.surfaces.values()].find(s => s.category === 'Wall' && s.sharedWith)!;
    const zone = m.surfaces.get(wall.sharedWith!)!.zone!;
    d.Zone[zone] = { ...d.Zone[zone], direction_of_relative_north: 90, x_origin: 12, y_origin: -4, z_origin: 2 };
    const transformed = readGeometryModel(d);
    for (const s of m.surfaces.values()) if (s.zone === zone) {
      d[s.type][s.name].vertices = vertexArray(s.points.map(p => transformed.fromWorld(m.toWorld(p, zone), zone)));
    }
    m = readGeometryModel(d);
    expect(m.surfaces.get(wall.name)!.sharedWith).toBe(wall.sharedWith);
    const r = addOpening(d, m, wall.name, { category: 'Door', construction: door,
      rect: { x: wall.rect!.x + 0.2, y: wall.rect!.y + 0.1, width: 0.6, height: 1.2 } });
    d = r.doc;
    const pair = coincident(d, r.name);
    expect(() => addOpening(d, pair.m, pair.b.base, { category: 'Door', construction: door, rect: pair.b.rect! })).toThrow('Sobrepõe');
    expect(checkOpening(pair.m, pair.m.surfaces.get(pair.b.base)!, pair.b.rect!, pair.b.name)).toEqual([]);
  });
});
