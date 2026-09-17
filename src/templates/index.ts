/**
 * Template registry. Templates are plain data files; adding a preset, glazing
 * type, building use or city only requires editing the JSON next to its types.
 */
import type { ClimateLocation } from './climates/types';
import type { ConstructionPreset, MaterialDef, SurfaceColor } from './constructions/types';
import type { GlazingTemplate } from './glazing/types';
import type { BuildingUseTemplate } from './buildingUses/types';
import type { OutputPreset } from './outputs/types';
import type { DoorTemplate } from './doors/types';
import cities from './climates/br-cities.json';
import materials from './constructions/materials.json';
import presets from './constructions/presets.json';
import colors from './constructions/colors.json';
import glazing from './glazing/glazing.json';
import residencial from './buildingUses/residencial.json';
import escritorio from './buildingUses/escritorio.json';
import comercio from './buildingUses/comercio.json';
import outputs from './outputs/outputs.json';
import doors from './doors/doors.json';

export interface TemplateLibrary {
  cities: ClimateLocation[];
  materials: Record<string, MaterialDef>;
  constructionPresets: ConstructionPreset[];
  surfaceColors: SurfaceColor[];
  glazing: GlazingTemplate[];
  doors: DoorTemplate[];
  buildingUses: BuildingUseTemplate[];
  outputs: OutputPreset[];
}

export const templates: TemplateLibrary = {
  cities: cities as ClimateLocation[],
  materials: materials as Record<string, MaterialDef>,
  constructionPresets: presets as ConstructionPreset[],
  surfaceColors: colors as SurfaceColor[],
  glazing: glazing as GlazingTemplate[],
  doors: doors as DoorTemplate[],
  buildingUses: [residencial, escritorio, comercio] as BuildingUseTemplate[],
  outputs: outputs as unknown as OutputPreset[],
};

export function byId<T extends { id: string }>(list: T[], id: string | undefined): T {
  return list.find((x) => x.id === id) ?? list[0];
}
