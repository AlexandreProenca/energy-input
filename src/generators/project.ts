import type { EpJsonFragment } from '@/core/epjson/types';
import type { WizardAnswers } from './answers';

/** Step 1 — Building and simulation settings with sensible defaults. */
export function generateProject(project: WizardAnswers['project'], runMode: WizardAnswers['runPeriod']['mode'], schemaVersion = '26.1'): EpJsonFragment {
  const designDaysOnly = runMode === 'designDays';
  return {
    Version: { 'Version 1': { version_identifier: schemaVersion } },
    Building: {
      [project.buildingName.trim() || 'Edifício']: {
        north_axis: project.northAxis,
        terrain: project.terrain,
        loads_convergence_tolerance_value: 0.04,
        temperature_convergence_tolerance_value: 0.4,
        solar_distribution: 'FullExterior',
        maximum_number_of_warmup_days: 25,
        minimum_number_of_warmup_days: 6,
      },
    },
    SimulationControl: {
      'SimulationControl 1': {
        // Ideal loads need no equipment sizing.
        do_zone_sizing_calculation: 'No',
        do_system_sizing_calculation: 'No',
        do_plant_sizing_calculation: 'No',
        run_simulation_for_sizing_periods: designDaysOnly ? 'Yes' : 'No',
        run_simulation_for_weather_file_run_periods: designDaysOnly ? 'No' : 'Yes',
      },
    },
    Timestep: { 'Timestep 1': { number_of_timesteps_per_hour: 6 } },
    HeatBalanceAlgorithm: { 'HeatBalanceAlgorithm 1': { algorithm: 'ConductionTransferFunction' } },
    GlobalGeometryRules: {
      'GlobalGeometryRules 1': { starting_vertex_position: 'UpperLeftCorner', vertex_entry_direction: 'Counterclockwise', coordinate_system: 'Relative' },
    },
  };
}
