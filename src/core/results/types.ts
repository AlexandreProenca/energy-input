/**
 * Tipos dos resultados da API de simulação.
 *
 * Contrato: https://homolog.ee.dev.br/v1/openapi.json (2026-09-22). As formas aqui foram
 * conferidas contra respostas reais, gravadas em `__fixtures__/` pela T001 e travadas por
 * `__tests__/fixtures.test.ts` — não contra a prosa do OpenAPI.
 *
 * Ficam em `src/core/` porque os módulos puros de agregação e conforto (T004, T005) são
 * tipados por eles, e `src/core/` não pode importar de `src/features/`. O cliente da API
 * reexporta daqui.
 */

/**
 * Frequência de relato, com os nomes estáveis do contrato.
 *
 * **Armadilha:** o motor grafa diferente do contrato — aqui é `zone_timestep` e
 * `run_period`, no `.sql` do EnergyPlus é `TimeStep` e `RunPeriod`. Filtrar pela grafia do
 * motor devolve vazio em silêncio.
 */
export type Frequency =
  | 'system_timestep'
  | 'zone_timestep'
  | 'hourly'
  | 'daily'
  | 'monthly'
  | 'run_period'
  | 'annual'
  | 'unknown';

/**
 * Um ponto da série. **Todo campo é anulável** no contrato, e o de valor realmente vem nulo
 * quando o motor não registrou a hora.
 *
 * `hour` vai de **1 a 24** e é o **fim** do intervalo, em hora local padrão: a hora 24 ainda
 * pertence ao dia anterior, embora o `timestamp` UTC já esteja no dia seguinte. Tratá-la
 * como hora 0 do dia seguinte desloca a série inteira em um dia.
 *
 * O ano vem do arquivo climático, não da execução — 2013 nas fixtures.
 */
export interface TimeSeriesPoint {
  timestamp: string | null;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  value: number | null;
}

/** A série que a consulta resolveu, com a chave concreta que o serviço escolheu. */
export interface SeriesVariable {
  name: string;
  /** Zona (`"ZONE ONE"`), ambiente (`"Environment"`) ou vazio, em medidor. */
  key: string;
  frequency: Frequency;
  units: string | null;
  /** Grafia do motor, capitalizada (`"Avg"`, `"Sum"`) — não a do contrato. */
  aggregation: string;
  is_meter: boolean;
}

/** `GET /v1/simulations/{id}/results/timeseries` — uma página de **uma** variável. */
export interface TimeSeries {
  simulation_id: string;
  status: string;
  variable: SeriesVariable;
  /** Liga a hora local ao `timestamp` em UTC. */
  utc_offset_hours: number | null;
  itens: TimeSeriesPoint[];
  proximo_cursor?: string | null;
}

/**
 * Um tipo de saída que o modelo **poderia** relatar. Note a ausência de `key`: o catálogo
 * vem do RDD/MDD e não promete chave concreta nem que a série foi gravada.
 */
export interface CatalogItem {
  type: 'variable' | 'meter';
  name: string;
  units: string | null;
  timestep: string;
  engine_timestep: string;
  aggregation: string;
  engine_aggregation: string;
}

/**
 * `GET /v1/simulations/{id}/results/variables`.
 *
 * **Não responde "o que esta execução gravou".** É paginado, e uma variável efetivamente
 * registrada pode não estar na primeira página — confirmado na T001 com
 * `Zone Operative Temperature`. Descobrir o que existe é por tentativa, tratando o 422.
 */
export interface VariableCatalog {
  simulation_id: string;
  status: string;
  /** `false` quando o serviço não conseguiu ler um dos dicionários. */
  complete: boolean;
  sources: string[];
  items: CatalogItem[];
  returned: number;
  total: number;
  next_cursor?: string | null;
}

/** Corpo de erro do serviço, em `application/problem+json` (RFC 9457). */
export interface ApiProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  request_id?: string;
  errors?: { field?: string; message?: string }[];
}

/** Parâmetros aceitos por `timeseries`. `variable` é obrigatório e precisa resolver uma só série. */
export interface TimeSeriesQuery {
  variable: string;
  key?: string;
  frequency?: Frequency;
  /** ISO 8601 **com fuso**. */
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}
