import type { EpJsonDocument } from '@/core/epjson/types';
import { setObject } from '@/core/epjson/document';
import { layersObject } from '@/core/geometry/edits';
import type { TemplateLibrary } from '@/templates';
import type { LayerDef } from '@/templates/constructions/types';
import { materialName, materialObject } from './envelope';
import { glazingConstructionName } from './windows';

/*
 * Template items the 3D editor can drop into any document. Objects are only
 * created when missing, using the same names as the wizard, so importing is
 * idempotent and never overwrites user edits.
 */

export type LibraryUse = 'wall' | 'roof' | 'floor' | 'window' | 'door';

export interface LibraryConstruction {
  id: string;
  name: string;
  use: LibraryUse;
  group: string;
  description?: string;
}

export function libraryConstructions(lib: TemplateLibrary): LibraryConstruction[] {
  const out: LibraryConstruction[] = [];
  for (const p of lib.constructionPresets) {
    const a = p.assemblies;
    out.push({ id: `preset:${p.id}:wall`, name: `Parede externa - ${p.label}`, use: 'wall', group: `Preset ${p.label}`, description: a.wall.label });
    out.push({ id: `preset:${p.id}:roof`, name: `Cobertura - ${p.label}`, use: 'roof', group: `Preset ${p.label}`, description: a.roof.label });
    out.push({ id: `preset:${p.id}:groundFloor`, name: `Piso térreo - ${p.label}`, use: 'floor', group: `Preset ${p.label}`, description: a.groundFloor.label });
    out.push({ id: `preset:${p.id}:interFloor`, name: `Laje entre pavimentos (piso) - ${p.label}`, use: 'floor', group: `Preset ${p.label}`, description: a.interFloor.label });
    out.push({ id: `preset:${p.id}:interCeiling`, name: `Laje entre pavimentos (forro) - ${p.label}`, use: 'roof', group: `Preset ${p.label}`, description: `${a.interFloor.label} (lado do forro)` });
  }
  for (const g of lib.glazing) out.push({ id: `glazing:${g.id}`, name: glazingConstructionName(g), use: 'window', group: 'Vidros', description: g.description });
  for (const d of lib.doors) out.push({ id: `door:${d.id}`, name: `Porta - ${d.label}`, use: 'door', group: 'Portas', description: d.description });
  return out;
}

function addMaterial(doc: EpJsonDocument, lib: TemplateLibrary, layer: LayerDef): { doc: EpJsonDocument; name: string } {
  const def = lib.materials[layer.material];
  if (!def) throw new Error(`Material desconhecido: ${layer.material}`);
  const name = materialName(layer.material, def, layer);
  const obj = materialObject(def, layer);
  if (doc[obj.type]?.[name]) return { doc, name };
  return { doc: setObject(doc, obj.type, name, obj.data), name };
}

function addLayered(doc: EpJsonDocument, lib: TemplateLibrary, name: string, layers: LayerDef[]) {
  if (doc.Construction?.[name]) return { doc, name };
  let next = doc;
  const names: string[] = [];
  for (const l of layers) {
    const r = addMaterial(next, lib, l);
    next = r.doc;
    names.push(r.name);
  }
  return { doc: setObject(next, 'Construction', name, layersObject(undefined, names)), name };
}

/** Ensures the library construction exists in `doc`; returns its name. */
export function importLibraryConstruction(doc: EpJsonDocument, lib: TemplateLibrary, id: string): { doc: EpJsonDocument; name: string } {
  const [kind, key, part] = id.split(':');
  if (kind === 'preset') {
    const p = lib.constructionPresets.find((x) => x.id === key);
    if (!p) throw new Error(`Preset desconhecido: ${key}`);
    const item = libraryConstructions(lib).find((c) => c.id === id)!;
    const layers = part === 'interCeiling' ? [...p.assemblies.interFloor.layers].reverse() : p.assemblies[part as 'wall' | 'roof' | 'groundFloor' | 'interFloor'].layers;
    return addLayered(doc, lib, item.name, layers);
  }
  if (kind === 'glazing') {
    const g = lib.glazing.find((x) => x.id === key);
    if (!g) throw new Error(`Vidro desconhecido: ${key}`);
    const name = glazingConstructionName(g);
    if (doc.Construction?.[name]) return { doc, name };
    let next = doc;
    if (!doc['WindowMaterial:SimpleGlazingSystem']?.[g.label]) {
      next = setObject(next, 'WindowMaterial:SimpleGlazingSystem', g.label, { u_factor: g.uFactor, solar_heat_gain_coefficient: g.shgc, visible_transmittance: g.visibleTransmittance });
    }
    return { doc: setObject(next, 'Construction', name, { outside_layer: g.label }), name };
  }
  if (kind === 'door') {
    const d = lib.doors.find((x) => x.id === key);
    if (!d) throw new Error(`Porta desconhecida: ${key}`);
    return addLayered(doc, lib, `Porta - ${d.label}`, d.layers);
  }
  throw new Error(`Item de biblioteca desconhecido: ${id}`);
}

/** Ensures a template material exists (at the given thickness); returns its name. */
export function importLibraryMaterial(doc: EpJsonDocument, lib: TemplateLibrary, id: string, thickness?: number) {
  return addMaterial(doc, lib, { material: id, thickness });
}
