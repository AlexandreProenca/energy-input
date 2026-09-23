import { safeFileName } from '@/lib/files';
import type { ApiProblem, TimeSeries, TimeSeriesPoint, TimeSeriesQuery, VariableCatalog } from '@/core/results/types';
export type { ApiProblem, CatalogItem, Frequency, SeriesVariable, TimeSeries, TimeSeriesPoint, TimeSeriesQuery, VariableCatalog } from '@/core/results/types';
import { parseSeriesCandidates, type SeriesCandidate } from '@/core/results/candidatas';
export type { SeriesCandidate } from '@/core/results/candidatas';
/** Contract: https://homolog.ee.dev.br/v1/openapi.json (2026-09-22). */
export interface Simulation {
  id: string; model_version_id: string; status: string; run_type: 'annual' | 'design_day';
  engine_version: string; failure_reason?: string | null; duration_seconds?: number | null;
}
export interface Weather {
  id: string; city: string; region: string; station: string; source: string;
  latitude: number; longitude: number; distance_km?: number | null;
}
export interface RunRequest {
  model_version_id: string; engine_version: string; run_type: 'annual' | 'design_day'; weather_id?: string;
  options: { sqlite: boolean; readvars: boolean; expand_objects: boolean };
}
export interface Summary {
  run_type: string;
  end_uses: { category: string; resources: { resource: string; value: number; units: string }[] }[];
  peak_demand: { resource: string; value: number; units: string }[];
  building_area: { name: string; value: number; units: string }[];
  comfort: { name: string; value: number; units: string }[];
}
export interface Diagnostics {
  available: boolean; fatal?: string | null; truncated?: boolean;
  verdict?: { warnings: number; severe_errors: number; elapsed: string } | null;
  entries: { severity: string; message: string; details?: string[]; remedy?: string | null }[];
}
export interface SimulationLogs { status: string; attempts: number; events: { at: string; event: string }[]; err_available: boolean; err_tail?: string; truncated?: boolean }
export interface Artifacts {
  complete: boolean; itens: { name: string; size_bytes: number; expires_at?: string | null }[];
}
export class SimulationApiError extends Error {
  constructor(message: string, public status: number, public retryAfter = 0, public problem?: ApiProblem) { super(message); }
}
/**
 * A série vive enquanto o `eplusout.sql` não expirar pela retenção; depois disso o serviço
 * responde **410** e só `/results/summary` sobrevive. É estado de interface, não falha:
 * o painel cai para o resumo permanente em vez de mostrar erro.
 */
export const isSeriesExpired = (e: unknown): boolean => e instanceof SimulationApiError && e.status === 410;
/**
 * As séries candidatas de um 422 de `/results/timeseries` — chave e frequência de cada uma.
 * O 422 de variável não registrada não tem candidatas e devolve lista vazia. Os três casos
 * estão em `src/core/results/candidatas.ts`.
 */
export const seriesCandidates = (e: unknown): SeriesCandidate[] =>
  e instanceof SimulationApiError && e.status === 422 ? parseSeriesCandidates(e.problem) : [];
export class SimulationApi {
  constructor(private token = '', private base = '/simulation-api/v1') {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      const headers = new Headers(init.headers);
      if (this.token.trim()) headers.set('Authorization', `Bearer ${this.token.trim().replace(/^Bearer\s+/i, '')}`);
      // O timeout continua valendo sempre; um `signal` do chamador é somado a ele, para que
      // cancelar uma carga não desligue a proteção contra requisição pendurada.
      const timeout = AbortSignal.timeout(60_000);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      response = await fetch(`${this.base}${path}`, { ...init, headers, cache: 'no-store', signal });
    } catch {
      throw new SimulationApiError('Não foi possível acessar a simulação. Confira a conexão e tente novamente.', 0);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiProblem;
      const fields = Array.isArray(body.errors) ? body.errors.map((e: { field?: string; message?: string }) => `${e.field ?? ''}: ${e.message ?? ''}`).join('; ') : '';
      // A chave vem do ambiente do servidor desde a T027: 401 quer dizer que ela não foi
      // configurada, está errada ou expirou — e a correção é lá, não na interface.
      const message = response.status === 401 ? 'A chave da API de simulação não está configurada no servidor, ou foi recusada. Defina SIMULATION_API_TOKEN no .env.local e reinicie o app (npm run dev ou docker compose up).'
        : response.status === 410 ? 'A série horária desta simulação expirou. O resumo permanente continua disponível.'
        : typeof body.detail === 'string' ? body.detail : `A API recusou a solicitação (HTTP ${response.status}).`;
      // O corpo inteiro viaja junto: achatá-lo na mensagem perderia as candidatas do 422,
      // que são a única forma de descobrir as chaves de uma variável (o catálogo não as traz).
      throw new SimulationApiError([message, fields, body.request_id ? `Referência: ${body.request_id}` : ''].filter(Boolean).join(' '), response.status, Number(response.headers.get('Retry-After')) || 0, body);
    }
    return response.json() as Promise<T>;
  }
  engines() { return this.request<{ engines: { version: string }[]; default: string }>('/engines'); }
  weather(city: string, cursor?: string) {
    const q = new URLSearchParams({ city, limit: '50' });
    if (cursor) q.set('cursor', cursor);
    return this.request<{ itens: Weather[]; proximo_cursor?: string | null }>(`/weather?${q}`);
  }
  uploadWeather(file: File, license: string) {
    const body = new FormData(); body.append('file', file); body.append('license', license);
    return this.request<Weather>('/weather', { method: 'POST', body });
  }
  uploadModel(content: string, fileName: string) {
    const body = new FormData(); body.append('file', new Blob([content], { type: 'application/json' }), safeFileName(fileName));
    return this.request<{ id: string; versao: { id: string; versao_do_motor: string } }>('/models', { method: 'POST', body });
  }
  create(body: RunRequest, key: string) {
    return this.request<Simulation>('/simulations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
  }
  status(id: string) { return this.request<Simulation>(`/simulations/${encodeURIComponent(id)}`); }
  cancel(id: string) { return this.request<Simulation>(`/simulations/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); }
  logs(id: string) { return this.request<SimulationLogs>(`/simulations/${encodeURIComponent(id)}/logs`); }
  summary(id: string) { return this.request<Summary>(`/simulations/${encodeURIComponent(id)}/results/summary`); }
  diagnostics(id: string) { return this.request<Diagnostics>(`/simulations/${encodeURIComponent(id)}/results/errors`); }
  artifacts(id: string) { return this.request<Artifacts>(`/simulations/${encodeURIComponent(id)}/artifacts`); }
  /** Catálogo RDD/MDD: tipos que o modelo poderia relatar, não o que a execução gravou. */
  variables(id: string, opts: { limit?: number; cursor?: string } = {}) {
    const q = new URLSearchParams({ limit: String(opts.limit ?? 200) });
    if (opts.cursor) q.set('cursor', opts.cursor);
    return this.request<VariableCatalog>(`/simulations/${encodeURIComponent(id)}/results/variables?${q}`);
  }
  /** Uma página da série de **uma** variável. Ambiguidade de chave e variável ausente são 422. */
  timeseries(id: string, query: TimeSeriesQuery, signal?: AbortSignal) {
    const q = new URLSearchParams({ variable: query.variable });
    for (const campo of ['key', 'frequency', 'from', 'to', 'cursor'] as const) {
      const valor = query[campo];
      if (valor) q.set(campo, valor);
    }
    // `!== undefined`, e não truthiness: `limit: 0` é inválido pelo contrato (mínimo 1), e
    // repassá-lo rende um 422 explícito em vez de o serviço aplicar o default de 10 000
    // calado — quem pediu 0 receberia 10 000 pontos achando que pediu nenhum.
    if (query.limit !== undefined) q.set('limit', String(query.limit));
    return this.request<TimeSeries>(`/simulations/${encodeURIComponent(id)}/results/timeseries?${q}`, { signal });
  }
  /**
   * Segue `proximo_cursor` até o fim e concatena os pontos, na ordem.
   *
   * Duas proteções contra cursor defeituoso, porque o teto sozinho não basta:
   *
   * - **Cursor que se repete** interrompe na hora. Só o teto de páginas deixaria o cliente
   *   concatenar N cópias da mesma página e devolver uma série com pontos duplicados — pior
   *   que devolver pouco, porque o gráfico sai plausível.
   * - **Teto de páginas** para o caso de cursores que mudam sem nunca acabar.
   *
   * Uma série anual horária cabe numa página só (8 760 pontos, confirmado contra o serviço),
   * então ambos só mordem no patológico. A interrupção é reportada em `completa`, não
   * silenciada: devolver meia série sem avisar produziria um gráfico plausível e errado.
   */
  async allTimeseries(id: string, query: TimeSeriesQuery, maxPaginas = 12, signal?: AbortSignal) {
    const itens: TimeSeriesPoint[] = [];
    let pagina = await this.timeseries(id, query, signal);
    const { variable, utc_offset_hours } = pagina;
    const vistos = new Set<string>();
    let lidas = 1;
    let repetiu = false;
    itens.push(...pagina.itens);
    while (pagina.proximo_cursor && lidas < maxPaginas) {
      if (vistos.has(pagina.proximo_cursor)) { repetiu = true; break; }
      vistos.add(pagina.proximo_cursor);
      pagina = await this.timeseries(id, { ...query, cursor: pagina.proximo_cursor }, signal);
      itens.push(...pagina.itens);
      lidas++;
    }
    return { variable, utc_offset_hours, itens, completa: !repetiu && !pagina.proximo_cursor, paginas: lidas };
  }
  download(id: string, name: string) {
    return this.request<{ download_url: string }>(`/simulations/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(name)}`);
  }
}
export const terminal = (status: string) => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(status);
