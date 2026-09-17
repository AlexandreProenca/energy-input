/**
 * Suggestions for `external_list` fields. The real list depends on the model
 * (EnergyPlus writes it to eplusout.rdd/.mdd after a run), so these are only
 * common starting points; free text is always accepted.
 */
export const EXTERNAL_LIST_SUGGESTIONS: Record<string, string[]> = {
  autoRDDvariable: [
    'Site Outdoor Air Drybulb Temperature',
    'Site Outdoor Air Relative Humidity',
    'Site Direct Solar Radiation Rate per Area',
    'Site Diffuse Solar Radiation Rate per Area',
    'Zone Mean Air Temperature',
    'Zone Operative Temperature',
    'Zone Mean Radiant Temperature',
    'Zone Air Relative Humidity',
    'Zone Air Temperature',
    'Zone Thermostat Heating Setpoint Temperature',
    'Zone Thermostat Cooling Setpoint Temperature',
    'Zone Ideal Loads Supply Air Total Heating Energy',
    'Zone Ideal Loads Supply Air Total Cooling Energy',
    'Zone Ideal Loads Supply Air Sensible Heating Rate',
    'Zone Ideal Loads Supply Air Sensible Cooling Rate',
    'Zone People Occupant Count',
    'Zone Lights Electricity Energy',
    'Zone Electric Equipment Electricity Energy',
    'Zone Infiltration Air Change Rate',
    'Zone Windows Total Transmitted Solar Radiation Energy',
    'Surface Inside Face Temperature',
    'Surface Outside Face Temperature',
    'Surface Window Transmitted Solar Radiation Energy',
    'Facility Total Electricity Demand Rate',
  ],
  autoRDDmeter: [
    'Electricity:Facility',
    'Electricity:Building',
    'InteriorLights:Electricity',
    'InteriorEquipment:Electricity',
    'Heating:Electricity',
    'Cooling:Electricity',
    'Fans:Electricity',
    'DistrictHeatingWater:Facility',
    'DistrictCooling:Facility',
    'NaturalGas:Facility',
    'EnergyTransfer:Facility',
  ],
};

export function suggestionsFor(lists: string[]): string[] {
  const out = new Set<string>();
  for (const l of lists) for (const s of EXTERNAL_LIST_SUGGESTIONS[l] ?? EXTERNAL_LIST_SUGGESTIONS.autoRDDvariable) out.add(s);
  return [...out];
}
