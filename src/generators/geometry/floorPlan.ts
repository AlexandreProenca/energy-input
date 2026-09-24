import { ShapeUtils, Vector2 } from 'three';
import type { EpObject } from '@/core/epjson/types';
import { toVertices, wallRect, ZONE_LIST_NAME, type BoxGeometryParams, type BoxGeometryResult, type Vec3, type WallInfo } from './boxGeometry';
import { chaveDoAmbiente } from '../conditioningKeys';

export type Point2 = [number, number];
export interface PlanRoom { id: string; name: string; points: Point2[] }
const EPS = 1e-7;
const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export const distance = (a: Point2, b: Point2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const signedArea = (p: Point2[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
export const roomArea = (p: Point2[]) => Math.abs(signedArea(p));
export const perimeter = (p: Point2[]) => p.reduce((s, a, i) => s + distance(a, p[(i + 1) % p.length]), 0);
const onSegment = (p: Point2, a: Point2, b: Point2) => Math.abs(cross(a, b, p)) < EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
function intersects(a: Point2, b: Point2, c: Point2, d: Point2) {
  return (cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS) || onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}
const triangles = (p: Point2[]) => ShapeUtils.triangulateShape(p.map(([x, y]) => new Vector2(x, y)), []).map(t => t.map(i => p[i]));
// Separating-axis test: contact at an edge or vertex is allowed; positive area is not.
function overlaps(a: Point2[], b: Point2[]) {
  return triangles(a).some(ta => triangles(b).some(tb => [ta, tb].every(t => t.every((p, i) => {
    const q = t[(i + 1) % 3]; const axis = [q[1] - p[1], p[0] - q[0]];
    const project = (v: Point2) => v[0] * axis[0] + v[1] * axis[1];
    const pa = ta.map(project), pb = tb.map(project);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > EPS;
  }))));
}
export function validateRooms(rooms: PlanRoom[]): string[] {
  if (!rooms.length) return ['Adicione pelo menos um ambiente fechado.'];
  const errors: string[] = [];
  const names = new Set<string>(), ids = new Set<string>();
  for (const r of rooms) {
    const name = r.name.trim().toLocaleLowerCase();
    if (!name || names.has(name)) errors.push('Os ambientes precisam de nomes preenchidos e únicos.');
    if (!r.id || ids.has(r.id)) errors.push('Identificador de ambiente duplicado.');
    names.add(name); ids.add(r.id);
    const p = r.points;
    if (p.length < 3 || p.length > 100 || p.some(v => v.some(n => !Number.isFinite(n) || Math.abs(n) > 500))) { errors.push(`${r.name}: use de 3 a 100 pontos com coordenadas entre −500 e 500 m.`); continue; }
    if (roomArea(p) < 0.01) errors.push(`${r.name}: a área deve ser de pelo menos 0,01 m².`);
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length];
      if (distance(a, b) < 0.01) errors.push(`${r.name}: existem pontos repetidos ou segmentos menores que 1 cm.`);
      if (Math.abs(cross(a, b, c)) < EPS && (onSegment(c, a, b) || onSegment(a, b, c))) errors.push(`${r.name}: segmentos consecutivos se sobrepõem.`);
      for (let j = i + 2; j < p.length; j++) {
        if (i === 0 && j === p.length - 1) continue;
        if (intersects(a, b, p[j], p[(j + 1) % p.length])) errors.push(`${r.name}: o contorno cruza ou toca a si mesmo.`);
      }
    }
  }
  if (!errors.length) for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    if (overlaps(rooms[i].points, rooms[j].points)) errors.push(`${rooms[i].name} e ${rooms[j].name}: os ambientes se sobrepõem.`);
  }
  return [...new Set(errors)];
}

/** One zone per room per floor. The same plan is repeated on every floor. */
export function generateFloorPlan(p: BoxGeometryParams & { rooms: PlanRoom[]; interiorWall: string; interiorWallReverse: string }): BoxGeometryResult {
  const errors = validateRooms(p.rooms);
  if (!Number.isInteger(p.floors) || p.floors < 1 || p.floors > 60 || !(p.floorHeight >= 2 && p.floorHeight <= 10)) errors.push('Pavimentos ou altura inválidos.');
  if (errors.length) throw new Error(errors.join(' '));
  const rooms = p.rooms.map(r => ({ ...r, points: signedArea(r.points) > 0 ? r.points : [...r.points].reverse() }));
  const allPoints = rooms.flatMap(r => r.points);
  const zoneName = (i: number, r: PlanRoom) => `Pavimento ${i + 1} · ${r.name.trim()}`;
  const surfaces: Record<string, EpObject> = {}, zones: Record<string, EpObject> = {};
  const infos: BoxGeometryResult['zones'] = [];
  for (let floor = 0; floor < p.floors; floor++) {
    const edges = new Map<string, { name: string; wall: WallInfo; zone: number }>();
    for (const r of rooms) {
      const zn = zoneName(floor, r), H = p.floorHeight;
      zones[zn] = { x_origin: 0, y_origin: 0, z_origin: floor * H, direction_of_relative_north: 0, type: 1, multiplier: 1, ceiling_height: H, volume: roomArea(r.points) * H, floor_area: roomArea(r.points) };
      const info = { name: zn, floorIndex: floor, zOrigin: floor * H, floorArea: roomArea(r.points), walls: [] as WallInfo[], conditioningKey: chaveDoAmbiente(r.id) };
      infos.push(info);
      let edgeIndex = 0;
      for (let i = 0; i < r.points.length; i++) {
        const a = r.points[i], b = r.points[(i + 1) % r.points.length];
        // Split shared boundaries at T junctions before pairing them.
        const pts = [a, ...allPoints.filter(v => onSegment(v, a, b) && distance(a, v) > EPS && distance(b, v) > EPS), b]
          .sort((v, w) => distance(a, v) - distance(a, w)).filter((v, j, arr) => !j || distance(v, arr[j - 1]) > EPS);
        for (let j = 0; j < pts.length - 1; j++) {
          const start = pts[j], end = pts[j + 1], L = distance(start, end), dx = (end[0] - start[0]) / L, dy = (end[1] - start[1]) / L;
          const name = `${zn} - Parede ${++edgeIndex}`;
          const wall: WallInfo = { name, origin: [start[0], start[1], 0], u: [dx, dy, 0], length: L, height: H, facade: Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'south' : 'north') : (dy > 0 ? 'east' : 'west') };
          const key = [start, end].map(v => v.map(n => n.toFixed(6)).join(',')).sort().join('|');
          const other = edges.get(key);
          surfaces[name] = { surface_type: 'Wall', construction_name: p.constructions.wall, zone_name: zn, outside_boundary_condition: 'Outdoors', sun_exposure: 'SunExposed', wind_exposure: 'WindExposed', number_of_vertices: 4, vertices: toVertices(wallRect(wall, 0, 0, L, H)) };
          if (other) {
            Object.assign(surfaces[name], { construction_name: p.interiorWallReverse, outside_boundary_condition: 'Surface', outside_boundary_condition_object: other.name, sun_exposure: 'NoSun', wind_exposure: 'NoWind' });
            Object.assign(surfaces[other.name], { construction_name: p.interiorWall, outside_boundary_condition: 'Surface', outside_boundary_condition_object: name, sun_exposure: 'NoSun', wind_exposure: 'NoWind' });
            infos[other.zone].walls = infos[other.zone].walls.filter(w => w.name !== other.name);
          } else { edges.set(key, { name, wall, zone: infos.length - 1 }); info.walls.push(wall); }
        }
      }
      // Preserve the room boundary as one surface; rendering triangulation is internal.
      const ts = [r.points];
      ts.forEach((t, i) => {
        if (signedArea(t) < 0) t.reverse();
        const bottom = `${zn} - Piso ${i + 1}`, top = `${zn} - ${floor === p.floors - 1 ? 'Cobertura' : 'Forro'} ${i + 1}`;
        surfaces[bottom] = { surface_type: 'Floor', construction_name: floor ? p.constructions.interFloor : p.constructions.groundFloor, zone_name: zn, outside_boundary_condition: floor ? 'Surface' : p.groundFloor === 'slab' ? 'Ground' : p.groundFloor === 'adjacent' ? 'Adiabatic' : 'Outdoors', ...(floor ? { outside_boundary_condition_object: `${zoneName(floor - 1, r)} - Forro ${i + 1}` } : {}), sun_exposure: 'NoSun', wind_exposure: !floor && p.groundFloor === 'raised' ? 'WindExposed' : 'NoWind', number_of_vertices: t.length, vertices: toVertices([...t].reverse().map(([x, y]): Vec3 => [x, y, 0])) };
        const last = floor === p.floors - 1;
        surfaces[top] = { surface_type: last && p.topFloor !== 'adjacent' ? 'Roof' : 'Ceiling', construction_name: last ? p.constructions.roof : p.constructions.interCeiling, zone_name: zn, outside_boundary_condition: last ? p.topFloor === 'adjacent' ? 'Adiabatic' : 'Outdoors' : 'Surface', ...(!last ? { outside_boundary_condition_object: `${zoneName(floor + 1, r)} - Piso ${i + 1}` } : {}), sun_exposure: last && p.topFloor !== 'adjacent' ? 'SunExposed' : 'NoSun', wind_exposure: last && p.topFloor !== 'adjacent' ? 'WindExposed' : 'NoWind', number_of_vertices: t.length, vertices: toVertices(t.map(([x, y]): Vec3 => [x, y, H])) };
      });
    }
  }
  return { fragment: { GlobalGeometryRules: { 'GlobalGeometryRules 1': { starting_vertex_position: 'UpperLeftCorner', vertex_entry_direction: 'Counterclockwise', coordinate_system: 'Relative' } }, Zone: zones, ZoneList: { [ZONE_LIST_NAME]: { zones: infos.map(z => ({ zone_name: z.name })) } }, 'BuildingSurface:Detailed': surfaces }, zones: infos };
}
