import type { EpJsonDocument, EpObject } from '@/core/epjson/types';

export type SurfaceKind = 'Wall' | 'Roof' | 'Floor' | 'Ceiling' | 'Window' | 'Door' | 'Other';

export interface PreviewPolygon {
  name: string;
  kind: SurfaceKind;
  zone?: string;
  /** World coordinates, EnergyPlus axes (X east, Y north, Z up), already rotated by the building north axis. */
  points: [number, number, number][];
}

type V = [number, number, number];

const SURFACE_TYPES = ['BuildingSurface:Detailed', 'Wall:Detailed', 'RoofCeiling:Detailed', 'Floor:Detailed'];

function num(v: unknown, d = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function rotateZ([x, y, z]: V, deg: number): V {
  const t = (deg * Math.PI) / 180;
  // EnergyPlus rotates clockwise (seen from above) for positive angles.
  return [x * Math.cos(t) + y * Math.sin(t), -x * Math.sin(t) + y * Math.cos(t), z];
}

function readVertexArray(obj: EpObject): V[] {
  const verts = obj.vertices;
  if (!Array.isArray(verts)) return [];
  return verts
    .map((v) => v as Record<string, unknown>)
    .map((v) => [num(v.vertex_x_coordinate, NaN), num(v.vertex_y_coordinate, NaN), num(v.vertex_z_coordinate, NaN)] as V)
    .filter((p) => p.every(Number.isFinite));
}

function readFlatVertices(obj: EpObject): V[] {
  const pts: V[] = [];
  for (let i = 1; i <= 4; i++) {
    const p: V = [num(obj[`vertex_${i}_x_coordinate`], NaN), num(obj[`vertex_${i}_y_coordinate`], NaN), num(obj[`vertex_${i}_z_coordinate`], NaN)];
    if (p.every(Number.isFinite)) pts.push(p);
  }
  return pts;
}

/**
 * Extracts drawable polygons from any epJSON document (not just wizard
 * output), honoring zone origins, zone relative north and building north axis.
 */
export function extractPolygons(doc: EpJsonDocument): { polygons: PreviewPolygon[]; northAxis: number } {
  const rules = Object.values(doc.GlobalGeometryRules ?? {})[0];
  const relative = !rules || String(rules.coordinate_system ?? 'Relative').toUpperCase() !== 'WORLD';
  const northAxis = num(Object.values(doc.Building ?? {})[0]?.north_axis);
  const zones = doc.Zone ?? {};
  const zoneUpper = new Map(Object.keys(zones).map((n) => [n.toUpperCase(), zones[n]]));

  const toWorld = (p: V, zoneName?: string): V => {
    let q = p;
    if (relative && zoneName) {
      const z = zoneUpper.get(zoneName.toUpperCase());
      if (z) {
        q = rotateZ(q, num(z.direction_of_relative_north));
        q = [q[0] + num(z.x_origin), q[1] + num(z.y_origin), q[2] + num(z.z_origin)];
      }
    }
    return rotateZ(q, northAxis);
  };

  const polygons: PreviewPolygon[] = [];
  const surfaceZone = new Map<string, string | undefined>();

  for (const type of SURFACE_TYPES) {
    for (const [name, obj] of Object.entries(doc[type] ?? {})) {
      const zone = typeof obj.zone_name === 'string' ? obj.zone_name : undefined;
      surfaceZone.set(name.toUpperCase(), zone);
      const raw = readVertexArray(obj);
      if (raw.length < 3) continue;
      const st = String(obj.surface_type ?? (type === 'Wall:Detailed' ? 'Wall' : type === 'Floor:Detailed' ? 'Floor' : 'Roof'));
      const kind: SurfaceKind = (['Wall', 'Roof', 'Floor', 'Ceiling'] as const).find((k) => k.toUpperCase() === st.toUpperCase()) ?? 'Other';
      polygons.push({ name, kind, zone, points: raw.map((p) => toWorld(p, zone)) });
    }
  }

  for (const [name, obj] of Object.entries(doc['FenestrationSurface:Detailed'] ?? {})) {
    const raw = readFlatVertices(obj);
    if (raw.length < 3) continue;
    const zone = surfaceZone.get(String(obj.building_surface_name ?? '').toUpperCase());
    const st = String(obj.surface_type ?? 'Window').toUpperCase();
    polygons.push({ name, kind: st.includes('DOOR') && st !== 'GLASSDOOR' ? 'Door' : 'Window', zone, points: raw.map((p) => toWorld(p, zone)) });
  }
  return { polygons, northAxis };
}
