import type { EpJsonDocument, EpJsonFragment } from '@/core/epjson/types';
import { mergeFragments } from '@/core/epjson/document';
import type { TemplateLibrary } from '@/templates';
import type { WizardAnswers, WizardStepId } from './answers';
import { generateProject } from './project';
import { generateLocation, resolveLocation, type ResolvedLocation } from './location';
import { generateRunPeriod } from './runPeriod';
import { generateEnvelope } from './envelope';
import { generateBoxGeometry, ZONE_LIST_NAME, type ZoneInfo } from './geometry/boxGeometry';
import { generateWindows } from './windows';
import { generateLoads } from './loads';
import { generateHvac } from './hvac';
import { generateOutputs } from './outputs';
import type { ConstructionPreset } from '@/templates/constructions/types';
import type { BuildingUseTemplate } from '@/templates/buildingUses/types';

export interface GenerationResult {
  document: EpJsonDocument;
  /** Fragment produced by each wizard step (for display and ownership tracking). */
  fragments: Partial<Record<WizardStepId, EpJsonFragment>>;
  info: {
    location: ResolvedLocation;
    zones: ZoneInfo[];
    preset: ConstructionPreset;
    use: BuildingUseTemplate;
    totalFloorArea: number;
    totalWindowArea: number;
  };
}

/**
 * Runs every step generator on the answers and merges the fragments. Every
 * answer has a default, so the result is always a complete, runnable file —
 * even when the user is still on step 1.
 */
export function generateDocument(answers: WizardAnswers, lib: TemplateLibrary, schemaVersion = '26.1'): GenerationResult {
  const location = resolveLocation(answers.location, lib);
  const envelope = generateEnvelope(answers.envelope, lib, answers.geometry.floors);
  const geometry = generateBoxGeometry({ ...answers.geometry, constructions: envelope.names });
  const windows = generateWindows(geometry.zones, answers.windows, lib);
  const loads = generateLoads(answers.loads, ZONE_LIST_NAME, lib);

  const fragments: GenerationResult['fragments'] = {
    project: generateProject(answers.project, answers.runPeriod.mode, schemaVersion),
    location: generateLocation(location),
    runPeriod: generateRunPeriod(answers.runPeriod),
    geometry: geometry.fragment,
    envelope: envelope.fragment,
    windows: windows.fragment,
    loads: loads.fragment,
    hvac: generateHvac(geometry.zones, answers.hvac, loads.use),
    outputs: generateOutputs(answers.outputs, lib),
  };

  return {
    document: mergeFragments(...Object.values(fragments)),
    fragments,
    info: {
      location,
      zones: geometry.zones,
      preset: envelope.preset,
      use: loads.use,
      totalFloorArea: geometry.zones.reduce((a, z) => a + z.floorArea, 0),
      totalWindowArea: windows.totalWindowArea,
    },
  };
}
