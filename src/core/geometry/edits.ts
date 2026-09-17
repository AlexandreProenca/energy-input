import type { EpJsonDocument, EpObject } from '../epjson/types';
import { setObject, uniqueName } from '../epjson/document';
import { planeFrame, rectVertices, type PlaneFrame, type Rect2 } from './frames';
import { readGeometryModel, readVertexArray, SUBSURFACE_TYPE, type GeometryModel, type GeometryRules, type SubsurfaceCategory, type SurfaceGeom } from './model';
import { r4, type Vec3 } from './vec';

/* Pure document edits used by the 3D geometry editor. */

const TOL = 1e-3;

// ---------------------------------------------------------------- vertices

export function vertexArray(points: Vec3[]) {
  return points.map(([x, y, z]) => ({ vertex_x_coordinate: r4(x), vertex_y_coordinate: r4(y), vertex_z_coordinate: r4(z) }));
}

export function flatVertices(points: Vec3[]): EpObject {
  const out: EpObject = {};
  points.forEach(([x, y, z], i) => {
    out[`vertex_${i + 1}_x_coordinate`] = r4(x);
    out[`vertex_${i + 1}_y_coordinate`] = r4(y);
    out[`vertex_${i + 1}_z_coordinate`] = r4(z);
  });
  return out;
}

// ---------------------------------------------------------------- surfaces

export function setSurfaceConstruction(doc: EpJsonDocument, model: GeometryModel, name: string, construction: string): EpJsonDocument {
  const s = model.surfaces.get(name);
  if (s) return setObject(doc, s.type, name, { ...doc[s.type][name], construction_name: construction });
  if (model.subsurfaces.has(name)) return setObject(doc, SUBSURFACE_TYPE, name, { ...doc[SUBSURFACE_TYPE][name], construction_name: construction });
  return doc;
}

// ---------------------------------------------------------------- windows & doors

export const MIN_OPENING = 0.1;

export const SUBSURFACE_LABEL: Record<SubsurfaceCategory, string> = { Window: 'Janela', Door: 'Porta', GlassDoor: 'Porta de vidro', Other: 'Abertura' };

/** Problems with placing `rect` on `base`, ignoring the opening named `self`. */
export function checkOpening(model: GeometryModel, base: SurfaceGeom, rect: Rect2, self?: string): string[] {
  const problems: string[] = [];
  if (!base.rect) return ['A superfície base não é retangular.'];
  if (rect.width < MIN_OPENING || rect.height < MIN_OPENING) problems.push(`Largura e altura devem ser ≥ ${MIN_OPENING * 100} cm.`);
  if (rect.x < base.rect.x - TOL || rect.y < base.rect.y - TOL || rect.x + rect.width > base.rect.x + base.rect.width + TOL || rect.y + rect.height > base.rect.y + base.rect.height + TOL) {
    problems.push('A abertura sai dos limites da parede.');
  }
  for (const other of base.subsurfaces) {
    if (other === self) continue;
    const o = model.subsurfaces.get(other)?.rect;
    if (o && rect.x < o.x + o.width - TOL && o.x < rect.x + rect.width - TOL && rect.y < o.y + o.height - TOL && o.y < rect.y + rect.height - TOL) {
      problems.push(`Sobrepõe “${other}”.`);
    }
  }
  return problems;
}

/** Keeps size where possible and moves the rectangle inside the base rectangle. */
export function clampRect(base: Rect2, r: Rect2): Rect2 {
  const width = Math.min(Math.max(r.width, MIN_OPENING), base.width);
  const height = Math.min(Math.max(r.height, MIN_OPENING), base.height);
  return {
    width,
    height,
    x: Math.min(Math.max(r.x, base.x), base.x + base.width - width),
    y: Math.min(Math.max(r.y, base.y), base.y + base.height - height),
  };
}

function openingPoints(rules: GeometryRules, frame: PlaneFrame, rect: Rect2) {
  return rectVertices(frame, rect, rules);
}

export function addOpening(
  doc: EpJsonDocument,
  model: GeometryModel,
  baseName: string,
  opts: { category: Exclude<SubsurfaceCategory, 'Other'>; rect: Rect2; construction: string; name?: string },
): { doc: EpJsonDocument; name: string } {
  const base = model.surfaces.get(baseName);
  if (!base?.frame || !base.rect) throw new Error('Só é possível adicionar aberturas em superfícies retangulares.');
  const rect = clampRect(base.rect, opts.rect);
  const name = opts.name ?? uniqueName(doc, SUBSURFACE_TYPE, `${baseName} - ${SUBSURFACE_LABEL[opts.category]} ${base.subsurfaces.length + 1}`);
  const data: EpObject = {
    surface_type: opts.category,
    construction_name: opts.construction,
    building_surface_name: baseName,
    ...(opts.category === 'Door' ? {} : { view_factor_to_ground: 'Autocalculate' }),
    multiplier: 1,
    number_of_vertices: 4,
    ...flatVertices(openingPoints(model.rules, base.frame, rect)),
  };
  return { doc: setObject(doc, SUBSURFACE_TYPE, name, data), name };
}

export function moveOpening(doc: EpJsonDocument, model: GeometryModel, name: string, rect: Rect2): EpJsonDocument {
  const sub = model.subsurfaces.get(name);
  const base = sub && model.surfaces.get(sub.base);
  if (!sub || !base?.frame || !base.rect) return doc;
  const obj = { ...doc[SUBSURFACE_TYPE][name] };
  for (let i = 1; i <= 4; i++) for (const a of ['x', 'y', 'z']) delete obj[`vertex_${i}_${a}_coordinate`];
  return setObject(doc, SUBSURFACE_TYPE, name, { ...obj, number_of_vertices: 4, ...flatVertices(openingPoints(model.rules, base.frame, rect)) });
}

/** Changing an opening between door and window types also swaps door-only fields. */
export function setOpeningCategory(doc: EpJsonDocument, name: string, category: Exclude<SubsurfaceCategory, 'Other'>, construction: string): EpJsonDocument {
  const obj: EpObject = { ...doc[SUBSURFACE_TYPE][name], surface_type: category, construction_name: construction };
  if (category === 'Door') delete obj.view_factor_to_ground;
  return setObject(doc, SUBSURFACE_TYPE, name, obj);
}

// ---------------------------------------------------------------- zone boxes

export interface Box {
  min: Vec3;
  max: Vec3;
}

/** Bounds of a zone whose surfaces all lie on the faces of one axis-aligned box. */
export function zoneBox(model: GeometryModel, zone: string): Box | undefined {
  const z = model.zones.get(zone);
  if (!z || z.surfaces.length < 6) return undefined;
  const pts = z.surfaces.flatMap((s) => model.surfaces.get(s)?.points ?? []);
  const min: Vec3 = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]))) as Vec3;
  const max: Vec3 = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]))) as Vec3;
  const onFace = (p: Vec3) => p.every((c, i) => Math.abs(c - min[i]) < TOL || Math.abs(c - max[i]) < TOL);
  if (max.some((m, i) => m - min[i] < TOL)) return undefined;
  return pts.every(onFace) ? { min, max } : undefined;
}

export interface BoxDims {
  width: number;
  depth: number;
  height: number;
}

export const boxDims = (b: Box): BoxDims => ({ width: r4(b.max[0] - b.min[0]), depth: r4(b.max[1] - b.min[1]), height: r4(b.max[2] - b.min[2]) });

/** Zone bounds in absolute coordinates (adds the zone origin in Relative mode). */
function absoluteBox(model: GeometryModel, zone: string): Box | undefined {
  const b = zoneBox(model, zone);
  const z = model.zones.get(zone);
  if (!b || !z) return undefined;
  if (!model.rules.relative) return b;
  if (Math.abs(z.relativeNorth) > TOL) return undefined;
  return { min: [b.min[0] + z.origin[0], b.min[1] + z.origin[1], b.min[2] + z.origin[2]], max: [b.max[0] + z.origin[0], b.max[1] + z.origin[1], b.max[2] + z.origin[2]] };
}

/** Zones stacked on the same footprint as `zone` (including itself). */
export function sameFootprintZones(model: GeometryModel, zone: string): string[] {
  const ref = absoluteBox(model, zone);
  if (!ref) return [zone];
  return [...model.zones.keys()].filter((z) => {
    const b = absoluteBox(model, z);
    return !!b && [0, 1].every((i) => Math.abs(b.min[i] - ref.min[i]) < TOL && Math.abs(b.max[i] - ref.max[i]) < TOL);
  });
}

/**
 * Resizes a box-shaped zone keeping its minimum corner fixed. Walls, floor
 * and roof move with the box; windows and doors keep their size, with their
 * horizontal position scaled along the wall and clamped inside it. With
 * `allFloors`, width/depth are applied to every zone on the same footprint.
 * A height change shifts the zones above by the difference.
 */
export function resizeZoneBox(doc: EpJsonDocument, zone: string, dims: BoxDims, allFloors: boolean): EpJsonDocument {
  const model = readGeometryModel(doc);
  const target = zoneBox(model, zone);
  const targetAbs = absoluteBox(model, zone);
  if (!target) throw new Error('Este pavimento não tem forma de caixa; edite os vértices no modo especialista.');
  if (dims.width < 0.5 || dims.depth < 0.5 || dims.height < 1) throw new Error('Dimensões mínimas: 0,5 m de largura/profundidade e 1 m de altura.');
  const oldDims = boxDims(target);
  const dz = dims.height - oldDims.height;
  const group = allFloors ? sameFootprintZones(model, zone) : [zone];
  let next = doc;

  for (const zn of group) {
    const box = zoneBox(model, zn)!;
    const newMax: Vec3 = [box.min[0] + dims.width, box.min[1] + dims.depth, zn === zone ? box.min[2] + dims.height : box.max[2]];
    const map = (p: Vec3): Vec3 => p.map((c, i) => (Math.abs(c - box.max[i]) < TOL ? newMax[i] : c)) as Vec3;
    next = transformZone(next, model, zn, map);
  }

  if (Math.abs(dz) > TOL && targetAbs) {
    for (const [zn] of model.zones) {
      if (zn === zone) continue;
      const b = absoluteBox(model, zn) ?? (model.rules.relative ? undefined : zoneBox(model, zn));
      const zg = model.zones.get(zn)!;
      const minZ = b ? b.min[2] : model.rules.relative ? zg.origin[2] : Infinity;
      if (minZ < targetAbs.max[2] - TOL) continue;
      if (model.rules.relative) {
        next = setObject(next, 'Zone', zn, { ...next.Zone[zn], z_origin: r4(zg.origin[2] + dz) });
      } else {
        next = transformZone(next, readGeometryModel(next), zn, (p) => [p[0], p[1], p[2] + dz]);
      }
    }
  }
  return next;
}

/** Applies `map` to a zone's surfaces, then re-fits its openings on the moved walls. */
function transformZone(doc: EpJsonDocument, model: GeometryModel, zone: string, map: (p: Vec3) => Vec3): EpJsonDocument {
  let next = doc;
  const z = model.zones.get(zone);
  if (!z) return doc;
  for (const sn of z.surfaces) {
    const s = model.surfaces.get(sn)!;
    const newPoints = readVertexArray(next[s.type][sn]).map(map);
    next = setObject(next, s.type, sn, { ...next[s.type][sn], vertices: vertexArray(newPoints) });

    const newFrame = planeFrame(newPoints);
    for (const subName of s.subsurfaces) {
      const sub = model.subsurfaces.get(subName)!;
      if (!sub.rect || !s.rect || !newFrame) {
        // Non-rectangular: move vertices the same way as the wall.
        next = setObject(next, SUBSURFACE_TYPE, subName, { ...next[SUBSURFACE_TYPE][subName], ...flatVertices(sub.points.map(map)) });
        continue;
      }
      const newModel = readGeometryModel(next);
      const newBase = newModel.surfaces.get(sn)!;
      if (!newBase.rect || !newBase.frame) continue;
      const cx = sub.rect.x + sub.rect.width / 2 - s.rect.x;
      const ratio = s.rect.width > 0 ? newBase.rect.width / s.rect.width : 1;
      const width = Math.min(sub.rect.width, newBase.rect.width);
      const height = Math.min(sub.rect.height, newBase.rect.height);
      const rect = clampRect(newBase.rect, { x: newBase.rect.x + cx * ratio - width / 2, y: sub.rect.y - s.rect.y + newBase.rect.y, width, height });
      next = moveOpening(next, newModel, subName, rect);
    }
  }
  return next;
}

// ---------------------------------------------------------------- constructions

export const LAYER_FIELDS = ['outside_layer', ...Array.from({ length: 9 }, (_, i) => `layer_${i + 2}`)];

export function constructionLayers(doc: EpJsonDocument, name: string): string[] {
  const c = doc.Construction?.[name];
  if (!c) return [];
  return LAYER_FIELDS.map((f) => c[f]).filter((v): v is string => typeof v === 'string' && v !== '');
}

export function layersObject(base: EpObject | undefined, layers: string[]): EpObject {
  const obj: EpObject = { ...(base ?? {}) };
  for (const f of LAYER_FIELDS) delete obj[f];
  layers.slice(0, LAYER_FIELDS.length).forEach((l, i) => (obj[LAYER_FIELDS[i]] = l));
  return obj;
}

export type MaterialKind = 'Material' | 'Material:NoMass' | 'Material:AirGap' | 'Window' | 'Unknown';

export interface MaterialInfo {
  name: string;
  type?: string;
  kind: MaterialKind;
  data?: EpObject;
  thickness?: number;
}

export function findMaterial(doc: EpJsonDocument, name: string): MaterialInfo {
  const upName = name.toUpperCase();
  for (const type of Object.keys(doc)) {
    if (!(type.startsWith('Material') || type.startsWith('WindowMaterial'))) continue;
    const key = Object.keys(doc[type]).find((k) => k.toUpperCase() === upName);
    if (!key) continue;
    const data = doc[type][key];
    const kind: MaterialKind = type === 'Material' ? 'Material' : type === 'Material:NoMass' ? 'Material:NoMass' : type === 'Material:AirGap' ? 'Material:AirGap' : type.startsWith('WindowMaterial') ? 'Window' : 'Unknown';
    return { name: key, type, kind, data, thickness: typeof data.thickness === 'number' ? data.thickness : undefined };
  }
  return { name, kind: 'Unknown' };
}

export function isGlazingConstruction(doc: EpJsonDocument, name: string): boolean {
  const first = constructionLayers(doc, name)[0];
  return !!first && findMaterial(doc, first).kind === 'Window';
}

export type EditScope = { mode: 'all' } | { mode: 'only'; element: string };

/**
 * Replaces a construction's layers. With scope "only", the construction is
 * copied and the copy is assigned to that single surface/opening, leaving
 * every other user of the original untouched.
 */
export function editConstruction(doc: EpJsonDocument, construction: string, layers: string[], scope: EditScope): { doc: EpJsonDocument; construction: string } {
  if (layers.length === 0) throw new Error('A construção precisa ter ao menos uma camada.');
  if (scope.mode === 'all') {
    return { doc: setObject(doc, 'Construction', construction, layersObject(doc.Construction?.[construction], layers)), construction };
  }
  const copy = uniqueName(doc, 'Construction', `${construction} - ${scope.element}`);
  let next = setObject(doc, 'Construction', copy, layersObject(doc.Construction?.[construction], layers));
  const model = readGeometryModel(next);
  next = setSurfaceConstruction(next, model, scope.element, copy);
  return { doc: next, construction: copy };
}

const CM_SUFFIX = /\s*\d+(?:[.,]\d+)?\s*cm(\s*\(α [\d.,]+\))?$/;

/** Returns the name of a Material equal to `material` but with another thickness, creating it if needed. */
export function materialWithThickness(doc: EpJsonDocument, material: string, thickness: number): { doc: EpJsonDocument; name: string } {
  const info = findMaterial(doc, material);
  if (info.kind !== 'Material' || !info.data) throw new Error('Só materiais com massa têm espessura editável.');
  if (Math.abs((info.thickness ?? 0) - thickness) < 1e-6) return { doc, name: info.name };
  const alpha = info.name.match(CM_SUFFIX)?.[1] ?? '';
  const base = info.name.replace(CM_SUFFIX, '').trim();
  const cm = `${(thickness * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cm`;
  const wanted = { ...info.data, thickness: r4(thickness) };
  let name = `${base} ${cm}${alpha}`.trim();
  const existing = doc.Material?.[name];
  if (existing && JSON.stringify({ ...existing, thickness: 0 }) === JSON.stringify({ ...wanted, thickness: 0 }) && existing.thickness === wanted.thickness) return { doc, name };
  if (existing) name = uniqueName(doc, 'Material', name);
  return { doc: setObject(doc, 'Material', name, wanted), name };
}

export function surfaceArea(s: SurfaceGeom): number {
  return s.rect ? r4(s.rect.width * s.rect.height) : 0;
}
