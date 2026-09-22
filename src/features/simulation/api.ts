import { safeFileName } from '@/lib/files';
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
  constructor(message: string, public status: number, public retryAfter = 0) { super(message); }
}
export class SimulationApi {
  constructor(private token = '', private base = '/simulation-api/v1') {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      const headers = new Headers(init.headers);
      if (this.token.trim()) headers.set('Authorization', `Bearer ${this.token.trim().replace(/^Bearer\s+/i, '')}`);
      response = await fetch(`${this.base}${path}`, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(60_000) });
    } catch {
      throw new SimulationApiError('Não foi possível acessar a simulação. Confira a conexão e tente novamente.', 0);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const fields = Array.isArray(body.errors) ? body.errors.map((e: { field?: string; message?: string }) => `${e.field ?? ''}: ${e.message ?? ''}`).join('; ') : '';
      const message = response.status === 401 ? 'Credencial ausente, inválida ou expirada. Configure a conexão novamente.'
        : typeof body.detail === 'string' ? body.detail : `A API recusou a solicitação (HTTP ${response.status}).`;
      throw new SimulationApiError([message, fields, body.request_id ? `Referência: ${body.request_id}` : ''].filter(Boolean).join(' '), response.status, Number(response.headers.get('Retry-After')) || 0);
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
  download(id: string, name: string) {
    return this.request<{ download_url: string }>(`/simulations/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(name)}`);
  }
}
export const terminal = (status: string) => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(status);
