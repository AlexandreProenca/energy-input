/** One "Until: HH:MM, value" step. */
export type ScheduleStep = [until: string, value: number];

export interface ScheduleRule {
  /** EnergyPlus "For:" day types, e.g. "Weekdays SummerDesignDay", "Saturday", "AllOtherDays". */
  days: string;
  steps: ScheduleStep[];
}

export interface BuildingUseTemplate {
  id: string;
  label: string;
  description: string;
  icon: 'home' | 'briefcase' | 'store';
  /** pessoas/m² */
  peoplePerArea: number;
  /** W/pessoa */
  activityLevel: number;
  /** W/m² */
  lightingPowerDensity: number;
  /** W/m² */
  equipmentPowerDensity: number;
  /** renovações por hora */
  infiltrationAch: number;
  heatingSetpoint: number;
  coolingSetpoint: number;
  /** Setpoints when unoccupied (used when "desligar fora do horário" is on). */
  setback: { heating: number; cooling: number };
  schedules: {
    occupancy: ScheduleRule[];
    lighting: ScheduleRule[];
    equipment: ScheduleRule[];
  };
}
