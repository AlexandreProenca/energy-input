import type { EpJsonFragment } from '@/core/epjson/types';
import { chaveDoPavimento } from '../conditioningKeys';

/*
 * Box ("shoebox") geometry: rectangular footprint, N stacked floors, one
 * thermal zone per floor. This module is deliberately self-contained so it can
 * be replaced by a polygon/footprint tool without touching other generators —
 * the rest of the wizard only consumes `BoxGeometryResult.zones`.
 *
 * Conventions (GlobalGeometryRules): UpperLeftCorner, Counterclockwise,
 * Relative. X = width (west→east), Y = depth (south→north), Z = up. Surface
 * vertices are in zone coordinates; each zone's origin is at z = floor base.
 */

export type Vec3 = [number, number, number];
export type FacadeId = 'south' | 'east' | 'north' | 'west';

export const FACADE_LABEL: Record<FacadeId, string> = {
  south: 'Sul',
  east: 'Leste',
  north: 'Norte',
  west: 'Oeste',
};

export interface BoxGeometryParams {
  width: number;
  depth: number;
  floors: number;
  floorHeight: number;
  groundFloor: 'slab' | 'raised' | 'adjacent';
  topFloor?: 'roof' | 'adjacent';
  constructions: {
    wall: string;
    roof: string;
    groundFloor: string;
    /** Floor side of a floor/ceiling pair between stacked zones. */
    interFloor: string;
    /** Ceiling side (layers reversed). */
    interCeiling: string;
  };
  zoneName?: (floorIndex: number) => string;
}

export interface WallInfo {
  name: string;
  facade: FacadeId;
  /** Lower-left corner seen from outside, zone coordinates. */
  origin: Vec3;
  /** Unit vector along the wall, left → right seen from outside. */
  u: Vec3;
  length: number;
  height: number;
}

export interface ZoneInfo {
  name: string;
  floorIndex: number;
  zOrigin: number;
  floorArea: number;
  walls: WallInfo[];
  /** Chave da escolha de climatização (`conditioning.ts`): o pavimento, ou o ambiente da planta. */
  conditioningKey?: string;
}

export interface BoxGeometryResult {
  fragment: EpJsonFragment;
  zones: ZoneInfo[];
}

export const defaultZoneName = (i: number) => `Pavimento ${i + 1}`;

const round = (n: number) => Math.round(n * 1e4) / 1e4;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const toVertices = (pts: Vec3[]) =>
  pts.map(([x, y, z]) => ({ vertex_x_coordinate: round(x), vertex_y_coordinate: round(y), vertex_z_coordinate: round(z) }));

/** Point on a wall plane at (x along wall, z height). */
export function wallPoint(w: WallInfo, x: number, z: number): Vec3 {
  return add(add(w.origin, scale(w.u, x)), [0, 0, z]);
}

/** Rectangle on a wall, CCW from the upper-left corner seen from outside. */
export function wallRect(w: WallInfo, x0: number, z0: number, width: number, height: number): Vec3[] {
  return [
    wallPoint(w, x0, z0 + height),
    wallPoint(w, x0, z0),
    wallPoint(w, x0 + width, z0),
    wallPoint(w, x0 + width, z0 + height),
  ];
}

export function validateBoxParams(p: Pick<BoxGeometryParams, 'width' | 'depth' | 'floors' | 'floorHeight'>): string[] {
  const errors: string[] = [];
  if (!(p.width >= 1 && p.width <= 500)) errors.push('A largura deve estar entre 1 e 500 m.');
  if (!(p.depth >= 1 && p.depth <= 500)) errors.push('A profundidade deve estar entre 1 e 500 m.');
  if (!(Number.isInteger(p.floors) && p.floors >= 1 && p.floors <= 60)) errors.push('O número de pavimentos deve ser inteiro, de 1 a 60.');
  if (!(p.floorHeight >= 2 && p.floorHeight <= 10)) errors.push('A altura do pavimento deve estar entre 2 e 10 m.');
  return errors;
}

export function generateBoxGeometry(p: BoxGeometryParams): BoxGeometryResult {
  const problems = validateBoxParams(p);
  if (problems.length) throw new Error(problems.join(' '));

  const { width: W, depth: D, floorHeight: H, floors } = p;
  const zoneName = p.zoneName ?? defaultZoneName;
  const surfaces: Record<string, Record<string, unknown>> = {};
  const zones: Record<string, Record<string, unknown>> = {};
  const zoneInfos: ZoneInfo[] = [];

  for (let i = 0; i < floors; i++) {
    const zn = zoneName(i);
    const z0 = round(i * H);
    zones[zn] = { direction_of_relative_north: 0, x_origin: 0, y_origin: 0, z_origin: z0, type: 1, multiplier: 1, ceiling_height: 'Autocalculate', volume: 'Autocalculate', floor_area: 'Autocalculate' };

    const walls: WallInfo[] = [
      { name: `${zn} - Parede Sul`, facade: 'south', origin: [0, 0, 0], u: [1, 0, 0], length: W, height: H },
      { name: `${zn} - Parede Leste`, facade: 'east', origin: [W, 0, 0], u: [0, 1, 0], length: D, height: H },
      { name: `${zn} - Parede Norte`, facade: 'north', origin: [W, D, 0], u: [-1, 0, 0], length: W, height: H },
      { name: `${zn} - Parede Oeste`, facade: 'west', origin: [0, D, 0], u: [0, -1, 0], length: D, height: H },
    ];
    for (const w of walls) {
      surfaces[w.name] = {
        surface_type: 'Wall',
        construction_name: p.constructions.wall,
        zone_name: zn,
        outside_boundary_condition: 'Outdoors',
        sun_exposure: 'SunExposed',
        wind_exposure: 'WindExposed',
        view_factor_to_ground: 'Autocalculate',
        number_of_vertices: 4,
        vertices: toVertices(wallRect(w, 0, 0, w.length, H)),
      };
    }

    // Floor: outward normal points down.
    const floorVerts: Vec3[] = [[0, 0, 0], [0, D, 0], [W, D, 0], [W, 0, 0]];
    const floorName = `${zn} - Piso`;
    if (i === 0) {
      const slab = p.groundFloor === 'slab';
      surfaces[floorName] = {
        surface_type: 'Floor',
        construction_name: p.constructions.groundFloor,
        zone_name: zn,
        outside_boundary_condition: slab ? 'Ground' : p.groundFloor === 'adjacent' ? 'Adiabatic' : 'Outdoors',
        sun_exposure: 'NoSun',
        wind_exposure: p.groundFloor === 'raised' ? 'WindExposed' : 'NoWind',
        view_factor_to_ground: 'Autocalculate',
        number_of_vertices: 4,
        vertices: toVertices(floorVerts),
      };
    } else {
      surfaces[floorName] = {
        surface_type: 'Floor',
        construction_name: p.constructions.interFloor,
        zone_name: zn,
        outside_boundary_condition: 'Surface',
        outside_boundary_condition_object: `${zoneName(i - 1)} - Forro`,
        sun_exposure: 'NoSun',
        wind_exposure: 'NoWind',
        view_factor_to_ground: 'Autocalculate',
        number_of_vertices: 4,
        vertices: toVertices(floorVerts),
      };
    }

    // Top: roof on the last floor, otherwise a ceiling paired with the floor above.
    const topVerts: Vec3[] = [[0, D, H], [0, 0, H], [W, 0, H], [W, D, H]];
    if (i === floors - 1) {
      surfaces[`${zn} - Cobertura`] = {
        surface_type: p.topFloor === 'adjacent' ? 'Ceiling' : 'Roof',
        construction_name: p.constructions.roof,
        zone_name: zn,
        outside_boundary_condition: p.topFloor === 'adjacent' ? 'Adiabatic' : 'Outdoors',
        sun_exposure: p.topFloor === 'adjacent' ? 'NoSun' : 'SunExposed',
        wind_exposure: p.topFloor === 'adjacent' ? 'NoWind' : 'WindExposed',
        view_factor_to_ground: 'Autocalculate',
        number_of_vertices: 4,
        vertices: toVertices(topVerts),
      };
    } else {
      surfaces[`${zn} - Forro`] = {
        surface_type: 'Ceiling',
        construction_name: p.constructions.interCeiling,
        zone_name: zn,
        outside_boundary_condition: 'Surface',
        outside_boundary_condition_object: `${zoneName(i + 1)} - Piso`,
        sun_exposure: 'NoSun',
        wind_exposure: 'NoWind',
        view_factor_to_ground: 'Autocalculate',
        number_of_vertices: 4,
        vertices: toVertices(topVerts),
      };
    }

    zoneInfos.push({ name: zn, floorIndex: i, zOrigin: z0, floorArea: round(W * D), walls, conditioningKey: chaveDoPavimento(i) });
  }

  return {
    fragment: {
      GlobalGeometryRules: {
        'GlobalGeometryRules 1': { starting_vertex_position: 'UpperLeftCorner', vertex_entry_direction: 'Counterclockwise', coordinate_system: 'Relative' },
      },
      Zone: zones,
      ZoneList: { 'Todos os pavimentos': { zones: zoneInfos.map((z) => ({ zone_name: z.name })) } },
      'BuildingSurface:Detailed': surfaces,
    },
    zones: zoneInfos,
  };
}

export const ZONE_LIST_NAME = 'Todos os pavimentos';

/** Newell's method: (unnormalized) outward normal of a planar polygon listed CCW from outside. */
export function polygonNormal(pts: Vec3[]): Vec3 {
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1, z1] = pts[i];
    const [x2, y2, z2] = pts[(i + 1) % pts.length];
    n[0] += (y1 - y2) * (z1 + z2);
    n[1] += (z1 - z2) * (x1 + x2);
    n[2] += (x1 - x2) * (y1 + y2);
  }
  return n;
}
