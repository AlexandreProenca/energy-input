import { useMemo } from 'react';
import { readGeometryModel, type GeometryModel } from '@/core/geometry/model';
import { zoneBox } from '@/core/geometry/edits';
import { useDocumentStore } from '@/store/documentStore';

export interface ZoneLevel {
  name: string;
  /** Absolute minimum Z, used to sort floors bottom-up. */
  baseZ: number;
}

export function useGeometryModel(): GeometryModel {
  const doc = useDocumentStore((s) => s.doc);
  return useMemo(() => readGeometryModel(doc), [doc]);
}

/** Zones sorted from the lowest to the highest. */
export function zoneLevels(model: GeometryModel): ZoneLevel[] {
  return [...model.zones.values()]
    .map((z) => {
      const box = zoneBox(model, z.name);
      const pts = z.surfaces.flatMap((s) => model.surfaces.get(s)?.points ?? []);
      const localMin = box ? box.min[2] : pts.length ? Math.min(...pts.map((p) => p[2])) : 0;
      return { name: z.name, baseZ: localMin + (model.rules.relative ? z.origin[2] : 0) };
    })
    .sort((a, b) => a.baseZ - b.baseZ || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
}
