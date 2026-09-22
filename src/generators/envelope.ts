import type { EpJsonFragment, EpObject } from '@/core/epjson/types';
import type { AssemblyKind, ConstructionPreset, LayerDef, MaterialDef } from '@/templates/constructions/types';
import { byId, type TemplateLibrary } from '@/templates';
import type { WizardAnswers } from './answers';

export interface ConstructionNames {
  wall: string;
  interiorWall: string;
  interiorWallReverse: string;
  roof: string;
  groundFloor: string;
  interFloor: string;
  interCeiling: string;
}

const cm = (m: number) => `${(m * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cm`;

export function materialName(id: string, def: MaterialDef, layer: LayerDef, absorptance?: number): string {
  if (def.kind === 'AirGap') return def.label;
  const t = layer.thickness ?? def.thickness;
  return `${def.label} ${cm(t)}${absorptance !== undefined ? ` (α ${absorptance.toLocaleString('pt-BR')})` : ''}`.replace(/\s+/g, ' ') || id;
}

/** Surface resistances (NBR 15220-2): walls horizontal flow, roofs downward flow. */
const SURFACE_RESISTANCE: Record<AssemblyKind, number> = { wall: 0.17, roof: 0.21, groundFloor: 0.21, interFloor: 0.34 };

export interface AssemblyThermal {
  /** Transmitância térmica, W/(m²·K), including surface resistances. */
  uValue: number;
  /** Capacidade térmica, kJ/(m²·K). */
  thermalCapacity: number;
  totalThickness: number;
}

export function assemblyThermal(kind: AssemblyKind, layers: LayerDef[], materials: Record<string, MaterialDef>): AssemblyThermal {
  let r = SURFACE_RESISTANCE[kind];
  let ct = 0;
  let thick = 0;
  for (const layer of layers) {
    const m = materials[layer.material];
    if (!m) throw new Error(`Material desconhecido no template: ${layer.material}`);
    if (m.kind === 'AirGap') {
      r += m.thermalResistance;
    } else {
      const t = layer.thickness ?? m.thickness;
      r += t / m.conductivity;
      ct += (t * m.density * m.specificHeat) / 1000;
      thick += t;
    }
  }
  return { uValue: Math.round((1 / r) * 100) / 100, thermalCapacity: Math.round(ct), totalThickness: Math.round(thick * 1000) / 1000 };
}

export function materialObject(def: MaterialDef, layer: LayerDef, absorptance?: number): { type: string; data: EpObject } {
  if (def.kind === 'AirGap') return { type: 'Material:AirGap', data: { thermal_resistance: def.thermalResistance } };
  const data: EpObject = {
    roughness: def.roughness,
    thickness: layer.thickness ?? def.thickness,
    conductivity: def.conductivity,
    density: def.density,
    specific_heat: def.specificHeat,
    thermal_absorptance: 0.9,
  };
  if (absorptance !== undefined) {
    data.solar_absorptance = absorptance;
    data.visible_absorptance = absorptance;
  }
  return { type: 'Material', data };
}

/** Step 5 — Material + Construction objects for the chosen preset. */
export function generateEnvelope(
  env: WizardAnswers['envelope'],
  lib: TemplateLibrary,
  floors = 1,
  geometry?: WizardAnswers['geometry'],
): { fragment: EpJsonFragment; names: ConstructionNames; preset: ConstructionPreset } {
  const preset = byId(lib.constructionPresets, env.presetId);
  const wallAlpha = byId(lib.surfaceColors, env.wallColorId).absorptance;
  const roofAlpha = byId(lib.surfaceColors, env.roofColorId).absorptance;
  const fragment: EpJsonFragment = { Material: {}, 'Material:AirGap': {}, Construction: {} };

  const build = (constructionName: string, layers: LayerDef[], outerAbsorptance?: number) => {
    const names = layers.map((layer, i) => {
      const def = lib.materials[layer.material];
      if (!def) throw new Error(`Material desconhecido no template: ${layer.material}`);
      const alpha = i === 0 ? outerAbsorptance : undefined;
      const name = materialName(layer.material, def, layer, alpha);
      const obj = materialObject(def, layer, alpha);
      fragment[obj.type][name] = obj.data;
      return name;
    });
    const data: EpObject = { outside_layer: names[0] };
    names.slice(1).forEach((n, i) => (data[`layer_${i + 2}`] = n));
    fragment.Construction[constructionName] = data;
  };

  const a = resolveAssemblies(preset, env.floorFinish);

  const names: ConstructionNames = {
    interiorWall: `Parede interna - ${preset.label}`,
    interiorWallReverse: `Parede interna (inversa) - ${preset.label}`,
    wall: `Parede externa - ${preset.label}`,
    roof: `Cobertura - ${preset.label}`,
    groundFloor: `Piso térreo - ${preset.label}`,
    interFloor: `Laje entre pavimentos (piso) - ${preset.label}`,
    interCeiling: `Laje entre pavimentos (forro) - ${preset.label}`,
  };
  build(names.interiorWall, a.wall.layers);
  build(names.interiorWallReverse, [...a.wall.layers].reverse());
  build(names.wall, a.wall.layers, wallAlpha);
  build(names.roof, geometry?.topFloor === 'adjacent' ? [...a.interFloor.layers].reverse() : a.roof.layers, geometry?.topFloor === 'adjacent' ? undefined : roofAlpha);
  build(names.groundFloor, geometry?.groundFloor === 'adjacent' ? a.interFloor.layers : a.groundFloor.layers);
  if (floors > 1) {
    // Interzone pairs must mirror each other's layer order.
    build(names.interFloor, a.interFloor.layers);
    build(names.interCeiling, [...a.interFloor.layers].reverse());
  }

  if (Object.keys(fragment['Material:AirGap']).length === 0) delete fragment['Material:AirGap'];
  return { fragment, names, preset };
}

/** Apply the selected finish consistently to every slab. */
export function resolveAssemblies(preset: ConstructionPreset, finish?: WizardAnswers['envelope']['floorFinish']): ConstructionPreset['assemblies'] {
  const replace = (a: ConstructionPreset['assemblies']['groundFloor']) => ({ ...a,
    label: a.label.replace(/cerâmica|revestimento/g, finish === 'vinyl' ? 'revestimento vinílico' : 'revestimento cerâmico'),
    layers: a.layers.map(l => ['piso_ceramico', 'piso_vinilico'].includes(l.material)
      ? { material: finish === 'vinyl' ? 'piso_vinilico' : 'piso_ceramico' } : l) });
  return { ...preset.assemblies, groundFloor: replace(preset.assemblies.groundFloor), interFloor: replace(preset.assemblies.interFloor) };
}
