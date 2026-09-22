import { describe, it, expect } from 'vitest';
import { validateRooms, roomArea, type PlanRoom } from '../geometry/floorPlan';
import { generateDocument } from '../compose';
import { defaultAnswers } from '../answers';
import { templates } from '@/templates';
import { loadTestSchema } from '@/core/testSchema';
import { checkCrossReferences } from '@/core/validation/crossRefs';
import { extractPolygons } from '@/features/preview/buildingMesh';
import { readGeometryModel } from '@/core/geometry/model';
import { surfaceArea } from '@/core/geometry/edits';
import { polygonNormal } from '../geometry/boxGeometry';
const rect = (id: string, x: number, y: number, w: number, h: number): PlanRoom => ({ id, name: id, points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] });
const { validator, index } = loadTestSchema();
function generate(rooms: PlanRoom[], floors = 1) {
  const a = defaultAnswers(); a.windows.automatic = true; a.geometry = { ...a.geometry, mode: 'plan', rooms, floors };
  const result = generateDocument(a, templates);
  expect(validator.validate(result.document)).toEqual([]);
  expect(checkCrossReferences(result.document, index)).toEqual([]);
  return result;
}
describe('planta por ambientes', () => {
  it('calcula a área real de um ambiente côncavo e independe do sentido', () => {
    const r: PlanRoom = { id: 'L', name: 'Sala em L', points: [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]] };
    expect(roomArea(r.points)).toBe(12);
    for (const points of [r.points, [...r.points].reverse()]) {
      const { document, info } = generate([{ ...r, points }]);
      expect(info.totalFloorArea).toBe(12);
      expect(Object.keys(document['FenestrationSurface:Detailed'])).toHaveLength(6);
      const model = readGeometryModel(document);
      expect([...model.surfaces.values()].filter(s => s.category === 'Floor').reduce((sum, s) => sum + surfaceArea(s), 0)).toBeCloseTo(12);
      const polys = extractPolygons(document).polygons;
      const floor = polys.filter(p => p.kind === 'Floor');
      expect(floor).toHaveLength(1);
      expect(floor[0].points).toHaveLength(6);
      expect(floor.reduce((s, p) => s + Math.abs(polygonNormal(p.points)[2]) / 2, 0)).toBeCloseTo(12);
      expect(floor.every(p => polygonNormal(p.points)[2] < 0)).toBe(true);
      expect(polys.filter(p => p.kind === 'Roof').every(p => polygonNormal(p.points)[2] > 0)).toBe(true);
    }
  });
  it('rejeita cruzamentos, repetição, área zero, sobreposição e contenção', () => {
    const r = rect('A', 0, 0, 4, 4);
    for (const rooms of [[], [{ ...r, points: [[0, 0], [4, 4], [0, 4], [4, 0]] as PlanRoom['points'] }], [{ ...r, points: [[0, 0], [0, 0], [4, 0]] as PlanRoom['points'] }], [r, rect('B', 1, 1, 1, 1)], [r, rect('B', 2, -1, 4, 4)], [r, rect('B', 0, 0, 4, 4)], [r, { ...rect('B', 6, 0, 2, 2), name: 'a' }]]) expect(validateRooms(rooms).length).toBeGreaterThan(0);
    expect(validateRooms([r, rect('B', 4, 4, 2, 2)])).toEqual([]);
  });
  it('divide paredes em encontros T, pareia superfícies e não gera janelas internas', () => {
    const { document, info } = generate([rect('A', 0, 0, 4, 4), rect('B', 4, 0, 3, 2), rect('C', 4, 2, 3, 2)], 2);
    expect(info.zones).toHaveLength(6); expect(info.totalFloorArea).toBe(56);
    const surfaces = document['BuildingSurface:Detailed'];
    const paired = Object.entries(surfaces).filter(([, s]) => s.outside_boundary_condition === 'Surface');
    expect(paired.filter(([, s]) => s.surface_type === 'Wall')).toHaveLength(12);
    const polygons = extractPolygons(document).polygons;
    for (const [name, s] of paired) {
      const otherName = s.outside_boundary_condition_object as string;
      expect(surfaces[otherName].outside_boundary_condition_object).toBe(name);
      const a = polygons.find(p => p.name === name)!, b = polygons.find(p => p.name === otherName)!;
      expect(a.points.map(p => p.join(',')).sort()).toEqual(b.points.map(p => p.join(',')).sort());
      const na = polygonNormal(a.points), nb = polygonNormal(b.points);
      expect(na.reduce((sum, n, i) => sum + n * nb[i], 0)).toBeLessThan(0);
    }
    for (const w of Object.values(document['FenestrationSurface:Detailed'])) expect(surfaces[w.building_surface_name as string].outside_boundary_condition).toBe('Outdoors');
  });
  it('mantém paredes inclinadas e coordenadas negativas', () => {
    const { info } = generate([{ id: 'T', name: 'Triângulo', points: [[-3, -2], [3, -2], [0, 2]] }]);
    expect(info.totalFloorArea).toBe(12);
    expect(info.zones[0].walls.map(w => w.length)).toEqual([6, 5, 5]);
  });
});
