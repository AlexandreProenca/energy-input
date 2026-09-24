import { templates } from '@/templates';
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
    /**
     * Ambientes **sem** climatização, pelas chaves de `conditioning.ts`. Ausente ou vazio: todos
     * climatizados (T031).
     */
    unconditioned?: string[];
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

/**
 * As páginas do assistente: etapas de resposta agrupadas para um fluxo com menos cliques.
 *
 * `WIZARD_STEPS` continua sendo a unidade das **respostas** — é a chave dos fragmentos que o
 * `compose.ts` gera e do que o `update` do `wizardStore` recebe. As páginas agrupam só a
 * **navegação**: projeto com clima, materiais com janelas, uso com climatização. Cada página
 * tem o id da primeira etapa que mostra, para que o id de uma página seja também um id de etapa.
 */
export const WIZARD_PAGES = ['project', 'runPeriod', 'geometry', 'envelope', 'loads', 'outputs', 'review'] as const;
export type WizardPageId = (typeof WIZARD_PAGES)[number];

/** Etapas de resposta mostradas em cada página, na ordem em que aparecem. */
export const PAGE_STEPS: Record<WizardPageId, readonly WizardStepId[]> = {
  project: ['project', 'location'],
  runPeriod: ['runPeriod'],
  geometry: ['geometry'],
  envelope: ['envelope', 'windows'],
  loads: ['loads', 'hvac'],
  outputs: ['outputs'],
  review: ['review'],
};

/**
 * A página que mostra uma etapa. Aceita qualquer valor porque também normaliza o que vem do
 * autosave: uma sessão parada em "Clima" — que deixou de ser página — volta em "Projeto e clima",
 * e um valor desconhecido volta ao começo.
 */
export function pageOf(step: unknown): WizardPageId {
  for (const page of WIZARD_PAGES) if ((PAGE_STEPS[page] as readonly unknown[]).includes(step)) return page;
  return 'project';
}

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
    // Derivado do catálogo, e não repetido aqui. A lista literal anterior coincidia com os
    // `defaultOn` por acaso: nada lia o campo, então as duas fontes podiam divergir em
    // silêncio, e quem tentasse mudar o padrão editando só o JSON não mudaria nada.
    outputs: { selected: templates.outputs.filter((p) => p.defaultOn).map((p) => p.id) },
  };
}
