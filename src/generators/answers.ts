import type { BioclimaticZone } from '@/templates/climates/types';
import type { ClimateSummary, DesignDayPair } from '@/core/weather/epw';

export type Terrain = 'Country' | 'Suburbs' | 'City' | 'Ocean' | 'Urban';
export type Facade = 'south' | 'east' | 'north' | 'west';

/** Location data not coming from the bundled city list (EPW/DDY upload or manual). */
export interface CustomLocation {
  name: string;
  latitude: number;
  longitude: number;
  timeZone: number;
  elevation: number;
  epwFileName?: string;
  designDays: DesignDayPair;
  designDaySource: string;
  groundTemperatures: number[];
  summary?: ClimateSummary;
}

export interface WizardAnswers {
  project: {
    buildingName: string;
    northAxis: number;
    terrain: Terrain;
  };
  location: {
    source: 'city' | 'custom';
    cityId: string;
    custom?: CustomLocation;
    zb: BioclimaticZone;
  };
  runPeriod: {
    mode: 'year' | 'range' | 'designDays';
    beginMonth: number;
    beginDay: number;
    endMonth: number;
    endDay: number;
  };
  geometry: {
    mode?: 'box' | 'plan';
    rooms?: import('./geometry/floorPlan').PlanRoom[];
    width: number;
    depth: number;
    floors: number;
    floorHeight: number;
    groundFloor: 'slab' | 'raised' | 'adjacent';
    topFloor?: 'roof' | 'adjacent';
  };
  envelope: {
    presetId: string;
    floorFinish?: 'ceramic' | 'vinyl';
    wallColorId: string;
    roofColorId: string;
  };
  windows: {
    automatic?: boolean;
    mode: 'uniform' | 'perFacade';
    wwr: number;
    perFacade: Record<Facade, number>;
    glazingId: string;
  };
  loads: {
    useId: string;
  };
  hvac: {
    heatingSetpoint: number;
    coolingSetpoint: number;
    setbackEnabled: boolean;
  };
  outputs: {
    selected: string[];
  };
}

export const WIZARD_STEPS = [
  'project',
  'location',
  'runPeriod',
  'geometry',
  'envelope',
  'windows',
  'loads',
  'hvac',
  'outputs',
  'review',
] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number];

export function defaultAnswers(): WizardAnswers {
  return {
    project: { buildingName: 'Meu edifício', northAxis: 0, terrain: 'Suburbs' },
    location: { source: 'city', cityId: 'sp-sao-paulo', zb: 3 },
    runPeriod: { mode: 'year', beginMonth: 1, beginDay: 1, endMonth: 12, endDay: 31 },
    geometry: { width: 10, depth: 8, floors: 1, floorHeight: 3, groundFloor: 'slab' },
    envelope: { presetId: 'padrao', wallColorId: 'clara', roofColorId: 'media' },
    windows: { automatic: false, mode: 'uniform', wwr: 20, perFacade: { north: 20, east: 20, south: 20, west: 20 }, glazingId: 'simples' },
    loads: { useId: 'residencial' },
    hvac: { heatingSetpoint: 18, coolingSetpoint: 26, setbackEnabled: false },
    outputs: { selected: ['resumo', 'cargas', 'conta'] },
  };
}
