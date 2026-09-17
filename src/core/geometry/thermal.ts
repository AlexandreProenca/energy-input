import type { EpJsonDocument } from '../epjson/types';
import { findMaterial } from './edits';
import type { SurfaceCategory } from './model';

export interface LayerInfo {
  name: string;
  kind: ReturnType<typeof findMaterial>['kind'];
  /** Physical thickness in m (0 for no-mass layers). */
  thickness: number;
  /** Thermal resistance in m²K/W. */
  resistance: number;
  /** Areal heat capacity in kJ/m²K. */
  capacity: number;
  missing: boolean;
}

export interface AssemblySummary {
  layers: LayerInfo[];
  thickness: number;
  uValue?: number;
  capacity: number;
  glazing?: { uFactor?: number; shgc?: number; vt?: number };
}

/** Inside + outside surface resistances (NBR 15220-2 conventions). */
export function surfaceResistance(category: SurfaceCategory | 'Opening', interzone: boolean): number {
  if (interzone) return category === 'Wall' ? 0.26 : 0.34;
  return category === 'Wall' || category === 'Opening' ? 0.17 : 0.21;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Layer-by-layer thickness, R, capacity and overall U for a construction in the document. */
export function summarizeConstruction(doc: EpJsonDocument, layers: string[], category: SurfaceCategory | 'Opening', interzone = false): AssemblySummary {
  const infos: LayerInfo[] = layers.map((name) => {
    const m = findMaterial(doc, name);
    const d = m.data ?? {};
    if (m.kind === 'Material') {
      const t = num(d.thickness) ?? 0;
      const k = num(d.conductivity);
      return { name, kind: m.kind, thickness: t, resistance: k ? t / k : 0, capacity: (t * (num(d.density) ?? 0) * (num(d.specific_heat) ?? 0)) / 1000, missing: false };
    }
    if (m.kind === 'Material:NoMass' || m.kind === 'Material:AirGap') {
      return { name, kind: m.kind, thickness: 0, resistance: num(d.thermal_resistance) ?? 0, capacity: 0, missing: false };
    }
    return { name, kind: m.kind, thickness: num(d.thickness) ?? 0, resistance: 0, capacity: 0, missing: m.kind === 'Unknown' };
  });

  const first = findMaterial(doc, layers[0] ?? '');
  if (first.kind === 'Window' && first.type === 'WindowMaterial:SimpleGlazingSystem') {
    const d = first.data ?? {};
    return { layers: infos, thickness: 0, capacity: 0, uValue: num(d.u_factor), glazing: { uFactor: num(d.u_factor), shgc: num(d.solar_heat_gain_coefficient), vt: num(d.visible_transmittance) } };
  }
  const r = surfaceResistance(category, interzone) + infos.reduce((a, l) => a + l.resistance, 0);
  const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    layers: infos,
    thickness: round(infos.reduce((a, l) => a + l.thickness, 0), 4),
    capacity: Math.round(infos.reduce((a, l) => a + l.capacity, 0)),
    uValue: infos.some((l) => l.missing) || first.kind === 'Window' ? undefined : round(1 / r, 2),
  };
}
