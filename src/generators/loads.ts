import type { EpJsonFragment } from '@/core/epjson/types';
import { byId, type TemplateLibrary } from '@/templates';
import type { BuildingUseTemplate } from '@/templates/buildingUses/types';
import type { WizardAnswers } from './answers';
import { LIMITS, SCHEDULES, compactSchedule, constantRules, scheduleTypeLimits } from './schedules';
import { mergeFragments } from '@/core/epjson/document';

/** Step 7 — occupancy, lighting, equipment and infiltration for all floors. */
export function generateLoads(
  loads: WizardAnswers['loads'],
  zoneListName: string,
  lib: TemplateLibrary,
): { fragment: EpJsonFragment; use: BuildingUseTemplate } {
  const use = byId(lib.buildingUses, loads.useId);
  const s = use.schedules;
  const fragment = mergeFragments(scheduleTypeLimits(), {
    'Schedule:Compact': {
      [SCHEDULES.alwaysOn]: compactSchedule(LIMITS.fraction, constantRules(1)),
      [SCHEDULES.occupancy]: compactSchedule(LIMITS.fraction, s.occupancy),
      [SCHEDULES.lighting]: compactSchedule(LIMITS.fraction, s.lighting),
      [SCHEDULES.equipment]: compactSchedule(LIMITS.fraction, s.equipment),
      [SCHEDULES.activity]: compactSchedule(LIMITS.activity, constantRules(use.activityLevel)),
    },
    People: {
      [`Pessoas - ${use.label}`]: {
        zone_or_zonelist_or_space_or_spacelist_name: zoneListName,
        number_of_people_schedule_name: SCHEDULES.occupancy,
        number_of_people_calculation_method: 'People/Area',
        people_per_floor_area: use.peoplePerArea,
        fraction_radiant: 0.3,
        sensible_heat_fraction: 'Autocalculate',
        activity_level_schedule_name: SCHEDULES.activity,
      },
    },
    Lights: {
      [`Iluminação - ${use.label}`]: {
        zone_or_zonelist_or_space_or_spacelist_name: zoneListName,
        schedule_name: SCHEDULES.lighting,
        design_level_calculation_method: 'Watts/Area',
        watts_per_floor_area: use.lightingPowerDensity,
        return_air_fraction: 0,
        fraction_radiant: 0.42,
        fraction_visible: 0.18,
      },
    },
    ElectricEquipment: {
      [`Equipamentos - ${use.label}`]: {
        zone_or_zonelist_or_space_or_spacelist_name: zoneListName,
        schedule_name: SCHEDULES.equipment,
        design_level_calculation_method: 'Watts/Area',
        watts_per_floor_area: use.equipmentPowerDensity,
        fraction_latent: 0,
        fraction_radiant: 0.3,
        fraction_lost: 0,
      },
    },
    'ZoneInfiltration:DesignFlowRate': {
      [`Infiltração - ${use.label}`]: {
        zone_or_zonelist_or_space_or_spacelist_name: zoneListName,
        schedule_name: SCHEDULES.alwaysOn,
        design_flow_rate_calculation_method: 'AirChanges/Hour',
        air_changes_per_hour: use.infiltrationAch,
      },
    },
  });
  return { fragment, use };
}
