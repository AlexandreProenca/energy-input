import type { EpJsonFragment, EpObject } from '@/core/epjson/types';
import type { BuildingUseTemplate } from '@/templates/buildingUses/types';
import type { ZoneInfo } from './geometry/boxGeometry';
import type { WizardAnswers } from './answers';
import { LIMITS, SCHEDULES, compactSchedule, constantRules, mapRules } from './schedules';

export const THERMOSTAT_NAME = 'Termostato de duplo setpoint';

/**
 * Step 8 — ZoneHVAC:IdealLoadsAirSystem per zone with its equipment list,
 * node connections and a dual-setpoint thermostat. Models the thermal load,
 * not real equipment performance.
 */
export function generateHvac(zones: ZoneInfo[], hvac: WizardAnswers['hvac'], use: BuildingUseTemplate): EpJsonFragment {
  const occupied = use.schedules.occupancy;
  // A dual setpoint with heating above cooling is a fatal error in EnergyPlus; keep a 0.5 °C deadband.
  hvac = { ...hvac, coolingSetpoint: Math.max(hvac.coolingSetpoint, hvac.heatingSetpoint + 0.5) };
  const heatingRules = hvac.setbackEnabled ? mapRules(occupied, (v) => (v > 0 ? hvac.heatingSetpoint : use.setback.heating)) : constantRules(hvac.heatingSetpoint);
  const coolingRules = hvac.setbackEnabled ? mapRules(occupied, (v) => (v > 0 ? hvac.coolingSetpoint : use.setback.cooling)) : constantRules(hvac.coolingSetpoint);

  const ideal: Record<string, EpObject> = {};
  const lists: Record<string, EpObject> = {};
  const connections: Record<string, EpObject> = {};
  const controls: Record<string, EpObject> = {};

  for (const z of zones) {
    const idealName = `${z.name} Sistema ideal`;
    const supply = `${z.name} Nó de insuflamento`;
    const exhaust = `${z.name} Nó de exaustão`;
    ideal[idealName] = {
      zone_supply_air_node_name: supply,
      zone_exhaust_air_node_name: exhaust,
      maximum_heating_supply_air_temperature: 50,
      minimum_cooling_supply_air_temperature: 13,
      maximum_heating_supply_air_humidity_ratio: 0.0156,
      minimum_cooling_supply_air_humidity_ratio: 0.0077,
      heating_limit: 'NoLimit',
      cooling_limit: 'NoLimit',
      dehumidification_control_type: 'ConstantSensibleHeatRatio',
      cooling_sensible_heat_ratio: 0.7,
      humidification_control_type: 'None',
    };
    lists[`${z.name} Equipamentos`] = {
      load_distribution_scheme: 'SequentialLoad',
      equipment: [
        {
          zone_equipment_object_type: 'ZoneHVAC:IdealLoadsAirSystem',
          zone_equipment_name: idealName,
          zone_equipment_cooling_sequence: 1,
          zone_equipment_heating_or_no_load_sequence: 1,
        },
      ],
    };
    connections[`${z.name} Conexões`] = {
      zone_name: z.name,
      zone_conditioning_equipment_list_name: `${z.name} Equipamentos`,
      zone_air_inlet_node_or_nodelist_name: supply,
      zone_air_exhaust_node_or_nodelist_name: exhaust,
      zone_air_node_name: `${z.name} Nó do ar`,
      zone_return_air_node_or_nodelist_name: `${z.name} Nó de retorno`,
    };
    controls[`${z.name} Controle`] = {
      zone_or_zonelist_name: z.name,
      control_type_schedule_name: SCHEDULES.controlType,
      control_1_object_type: 'ThermostatSetpoint:DualSetpoint',
      control_1_name: THERMOSTAT_NAME,
    };
  }

  return {
    'Schedule:Compact': {
      [SCHEDULES.heating]: compactSchedule(LIMITS.temperature, heatingRules),
      [SCHEDULES.cooling]: compactSchedule(LIMITS.temperature, coolingRules),
      // 4 = DualSetpoint
      [SCHEDULES.controlType]: compactSchedule(LIMITS.control, constantRules(4)),
    },
    'ThermostatSetpoint:DualSetpoint': {
      [THERMOSTAT_NAME]: {
        heating_setpoint_temperature_schedule_name: SCHEDULES.heating,
        cooling_setpoint_temperature_schedule_name: SCHEDULES.cooling,
      },
    },
    'ZoneControl:Thermostat': controls,
    'ZoneHVAC:IdealLoadsAirSystem': ideal,
    'ZoneHVAC:EquipmentList': lists,
    'ZoneHVAC:EquipmentConnections': connections,
  };
}
