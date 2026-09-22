import { findSharedSurfaces } from './sharedSurfaces';
import type { EpJsonDocument, EpObject } from '../epjson/types';
import { isFrameRectangle, localBounds, planeFrame, type PlaneFrame, type Rect2, type StartCorner, type VertexRules } from './frames';
import type { Vec3 } from './vec';

/*
 * Read model of a document's geometry, used by the 3D editor. Coordinates
 * stay as written in the file ("raw"); `toWorld` applies zone origins, zone
 * relative north and the building north axis for display.
 */

export const SURFACE_TYPES = ['BuildingSurface:Detailed', 'Wall:Detailed', 'RoofCeiling:Detailed', 'Floor:Detailed'] as const;
export const SUBSURFACE_TYPE = 'FenestrationSurface:Detailed';

export type SurfaceCategory = 'Wall' | 'Floor' | 'Roof' | 'Ceiling';
export type SubsurfaceCategory = 'Window' | 'Door' | 'GlassDoor' | 'Other';

export interface GeometryRules extends VertexRules {
  relative: boolean;
}

export interface ZoneGeom {
  name: string;
  origin: Vec3;
  relativeNorth: number;
  surfaces: string[];
}

export interface SurfaceGeom {
  type: string;
  name: string;
  category: SurfaceCategory;
  zone?: string;
  construction?: string;
  boundary?: string;
  boundaryObject?: string;
  /** Opposite thermal face of the same physical partition, matched by world vertices. */
  sharedWith?: string;
  points: Vec3[];
  frame?: PlaneFrame;
  /** Present when the surface is a rectangle in its frame. */
  rect?: Rect2;
  subsurfaces: string[];
}

export interface SubsurfaceGeom {
  sharedWith?: string;
  name: string;
  category: SubsurfaceCategory;
  surfaceType: string;
  base: string;
  construction?: string;
  points: Vec3[];
  /** Position inside the base surface frame, when both are rectangles. */
  rect?: Rect2;
}

export interface GeometryModel {
  rules: GeometryRules;
  northAxis: number;
  zones: Map<string, ZoneGeom>;
  surfaces: Map<string, SurfaceGeom>;
  subsurfaces: Map<string, SubsurfaceGeom>;
  toWorld: (p: Vec3, zone?: string) => Vec3;
  fromWorld: (p: Vec3, zone?: string) => Vec3;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const up = (s: unknown) => (typeof s === 'string' ? s.toUpperCase() : '');

export function readRules(doc: EpJsonDocument): GeometryRules {
  const g = Object.values(doc.GlobalGeometryRules ?? {})[0] ?? {};
  const start = (['UpperLeftCorner', 'LowerLeftCorner', 'LowerRightCorner', 'UpperRightCorner'] as StartCorner[]).find((c) => up(g.starting_vertex_position) === c.toUpperCase());
  return {
    start: start ?? 'UpperLeftCorner',
    counterclockwise: up(g.vertex_entry_direction) !== 'CLOCKWISE',
    relative: up(g.coordinate_system) !== 'WORLD',
  };
}

export function readVertexArray(obj: EpObject): Vec3[] {
  if (!Array.isArray(obj.vertices)) return [];
  return (obj.vertices as Record<string, unknown>[])
    .map((v) => [num(v?.vertex_x_coordinate, NaN), num(v?.vertex_y_coordinate, NaN), num(v?.vertex_z_coordinate, NaN)] as Vec3)
    .filter((p) => p.every(Number.isFinite));
}

export function readFlatVertices(obj: EpObject): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 1; i <= 4; i++) {
    const p: Vec3 = [num(obj[`vertex_${i}_x_coordinate`], NaN), num(obj[`vertex_${i}_y_coordinate`], NaN), num(obj[`vertex_${i}_z_coordinate`], NaN)];
    if (p.every(Number.isFinite)) pts.push(p);
  }
  return pts;
}

function rotateZ([x, y, z]: Vec3, deg: number): Vec3 {
  const t = (deg * Math.PI) / 180;
  return [x * Math.cos(t) + y * Math.sin(t), -x * Math.sin(t) + y * Math.cos(t), z];
}

function categoryOf(type: string, obj: EpObject): SurfaceCategory {
  if (type === 'Wall:Detailed') return 'Wall';
  if (type === 'Floor:Detailed') return 'Floor';
  const st = up(obj.surface_type);
  if (st === 'FLOOR') return 'Floor';
  if (st === 'ROOF') return 'Roof';
  if (st === 'CEILING') return 'Ceiling';
  if (type === 'RoofCeiling:Detailed') return 'Roof';
  return 'Wall';
}

export function readGeometryModel(doc: EpJsonDocument): GeometryModel {
  const rules = readRules(doc);
  const northAxis = num(Object.values(doc.Building ?? {})[0]?.north_axis);
  const zones = new Map<string, ZoneGeom>();
  const zoneByUpper = new Map<string, ZoneGeom>();
  for (const [name, z] of Object.entries(doc.Zone ?? {})) {
    const zg: ZoneGeom = { name, origin: [num(z.x_origin), num(z.y_origin), num(z.z_origin)], relativeNorth: num(z.direction_of_relative_north), surfaces: [] };
    zones.set(name, zg);
    zoneByUpper.set(name.toUpperCase(), zg);
  }

  const surfaces = new Map<string, SurfaceGeom>();
  const surfaceByUpper = new Map<string, SurfaceGeom>();
  for (const type of SURFACE_TYPES) {
    for (const [name, obj] of Object.entries(doc[type] ?? {})) {
      const points = readVertexArray(obj);
      const frame = planeFrame(points);
      const zoneName = typeof obj.zone_name === 'string' ? zoneByUpper.get(obj.zone_name.toUpperCase())?.name ?? obj.zone_name : undefined;
      const s: SurfaceGeom = {
        type,
        name,
        category: categoryOf(type, obj),
        zone: zoneName,
        construction: typeof obj.construction_name === 'string' ? obj.construction_name : undefined,
        boundary: typeof obj.outside_boundary_condition === 'string' ? obj.outside_boundary_condition : undefined,
        boundaryObject: typeof obj.outside_boundary_condition_object === 'string' ? obj.outside_boundary_condition_object : undefined,
        points,
        frame,
        rect: frame && isFrameRectangle(frame, points) ? localBounds(frame, points) : undefined,
        subsurfaces: [],
      };
      surfaces.set(name, s);
      surfaceByUpper.set(name.toUpperCase(), s);
      if (zoneName) zones.get(zoneName)?.surfaces.push(name);
    }
  }

  const subsurfaces = new Map<string, SubsurfaceGeom>();
  for (const [name, obj] of Object.entries(doc[SUBSURFACE_TYPE] ?? {})) {
    const base = surfaceByUpper.get(up(obj.building_surface_name));
    const points = readFlatVertices(obj);
    const st = up(obj.surface_type);
    const category: SubsurfaceCategory = st === 'WINDOW' ? 'Window' : st === 'DOOR' ? 'Door' : st === 'GLASSDOOR' ? 'GlassDoor' : 'Other';
    const sub: SubsurfaceGeom = {
      name,
      category,
      surfaceType: String(obj.surface_type ?? ''),
      base: base?.name ?? String(obj.building_surface_name ?? ''),
      construction: typeof obj.construction_name === 'string' ? obj.construction_name : undefined,
      points,
      rect: base?.frame && base.rect && points.length === 4 && isFrameRectangle(base.frame, points) ? localBounds(base.frame, points) : undefined,
    };
    subsurfaces.set(name, sub);
    base?.subsurfaces.push(name);
  }

  const toWorld = (p: Vec3, zone?: string): Vec3 => {
    let q = p;
    const z = zone ? zones.get(zone) : undefined;
    if (rules.relative && z) {
      q = rotateZ(q, z.relativeNorth);
      q = [q[0] + z.origin[0], q[1] + z.origin[1], q[2] + z.origin[2]];
    }
    return rotateZ(q, northAxis);
  };

  const fromWorld = (p: Vec3, zone?: string): Vec3 => {
    let q = rotateZ(p, -northAxis);
    const z = zone ? zones.get(zone) : undefined;
    if (rules.relative && z) {
      q = [q[0] - z.origin[0], q[1] - z.origin[1], q[2] - z.origin[2]];
      q = rotateZ(q, -z.relativeNorth);
    }
    return q;
  };
  const pairs = findSharedSurfaces([...surfaces.values()].map(s => ({ name: s.name, zone: s.zone, category: s.category, points: s.points.map(p => toWorld(p, s.zone)) })));
  for (const [name, other] of pairs) surfaces.get(name)!.sharedWith = other;
  for (const sub of subsurfaces.values()) {
    const ref = doc[SUBSURFACE_TYPE][sub.name].outside_boundary_condition_object;
    const other = typeof ref === 'string' ? [...subsurfaces.values()].find(s => s.name.toUpperCase() === ref.toUpperCase()) : undefined;
    if (other && surfaces.get(sub.base)?.sharedWith === other.base &&
        String(doc[SUBSURFACE_TYPE][other.name].outside_boundary_condition_object).toUpperCase() === sub.name.toUpperCase()) sub.sharedWith = other.name;
  }
  return { rules, northAxis, zones, surfaces, subsurfaces, toWorld, fromWorld };
}
