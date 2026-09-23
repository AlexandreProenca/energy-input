import { create } from 'zustand';
import { serializeDocument } from '@/core/epjson/document';
import { useDocumentStore } from '@/store/documentStore';
import { useSchemaStore } from '@/store/schemaStore';
import { isSimulationId } from '@/core/ids';
import { SimulationApi, SimulationApiError, terminal, type RunRequest, type Simulation, type Summary, type Diagnostics, type Artifacts, type SimulationLogs } from './api';

interface Attempt { key: string; body: RunRequest; fileName: string; sentAt: string }
interface SimulationState {
  logs?: SimulationLogs;
  open: boolean; busy: boolean; phase?: string; error?: string;
  canRestart?: boolean;
  attempt?: Attempt; simulation?: Simulation; summary?: Summary; diagnostics?: Diagnostics; artifacts?: Artifacts;
  setOpen: (open: boolean) => void;
  start: (engine: string, runType: 'annual' | 'design_day', weatherId?: string) => Promise<void>;
  retry: () => Promise<void>;
  discardRejected: () => void;
  refresh: () => Promise<void>;
  cancel: () => Promise<void>;
  track: (id: string) => Promise<void>;
  loadResults: () => Promise<void>;
}
const KEY = 'energy-input:simulation:v1';
function remember(attempt?: Attempt, simulation?: Simulation) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ attempt, simulation })); } catch { /* storage unavailable */ }
}
function restore(): { attempt?: Attempt; simulation?: Simulation } {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
    if (value.attempt?.body?.model_version_id && value.attempt?.key || isSimulationId(value.simulation?.id ?? '')) return value;
  } catch { /* unavailable or malformed */ }
  return {};
}
let timer: ReturnType<typeof setTimeout> | undefined;
let refreshing = false;
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
export const useSimulationStore = create<SimulationState>((set, get) => ({
  open: false, busy: false, ...restore(),
  setOpen: open => set({ open }),
  discardRejected: () => { if (!get().canRestart || get().busy) return; set({ attempt: undefined, error: undefined, canRestart: false }); try { sessionStorage.removeItem(KEY); } catch { /* unavailable */ } },
  async start(engine, runType, weatherId) {
    if (get().busy || (get().simulation && !terminal(get().simulation!.status))) return;
    clearTimeout(timer);
    try { sessionStorage.removeItem(KEY); } catch { /* unavailable */ }
    set({ canRestart: false, busy: true, error: undefined, phase: 'Enviando uma cópia do modelo…', summary: undefined, diagnostics: undefined, artifacts: undefined, logs: undefined, simulation: undefined, attempt: undefined });
    try {
      const d = useDocumentStore.getState(), schema = useSchemaStore.getState();
      const issues = schema.validator?.validate(d.doc).filter(i => i.severity === 'error') ?? [];
      if (issues.length) throw new Error(`Corrija os ${issues.length} erros do modelo antes de simular.`);
      if (!engine) throw new Error('Selecione uma versão do EnergyPlus.');
      if (runType === 'annual' && !weatherId) throw new Error('Selecione ou envie um arquivo climático EPW.');
      const content = serializeDocument(d.doc, schema.index), fileName = d.fileName;
      const api = new SimulationApi();
      const model = await api.uploadModel(content, fileName);
      const attempt: Attempt = { key: crypto.randomUUID(), fileName, sentAt: new Date().toISOString(), body: {
        model_version_id: model.versao.id, engine_version: engine, run_type: runType,
        ...(runType === 'annual' ? { weather_id: weatherId } : {}), options: { sqlite: true, readvars: false, expand_objects: false },
      } };
      set({ attempt, phase: 'Solicitando a simulação…' }); remember(attempt);
      const simulation = await api.create(attempt.body, attempt.key);
      set({ simulation }); remember(attempt, simulation);
    } catch (e) { set({ error: errorText(e), canRestart: e instanceof SimulationApiError && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status) }); }
    finally { set({ busy: false, phase: undefined }); }
    if (get().simulation) await get().refresh();
  },
  async retry() {
    const { attempt, busy } = get(); if (!attempt || busy) return;
    set({ busy: true, error: undefined, phase: 'Retomando a solicitação original…' });
    try {
      const simulation = await new SimulationApi().create(attempt.body, attempt.key);
      set({ simulation }); remember(attempt, simulation);
    } catch (e) { set({ error: errorText(e), canRestart: e instanceof SimulationApiError && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status) }); }
    finally { set({ busy: false, phase: undefined }); }
    if (get().simulation) await get().refresh();
  },
  async refresh() {
    const { simulation } = get(); if (!simulation || refreshing) return;
    refreshing = true; clearTimeout(timer);
    try {
      const updated = await new SimulationApi().status(simulation.id);
      if (get().simulation?.id !== updated.id) return;
      set({ simulation: updated, error: undefined });
      remember(get().attempt, updated);
      if (terminal(updated.status)) await get().loadResults();
      else timer = setTimeout(() => void get().refresh(), 5000);
    } catch (e) { set({ error: `${errorText(e)} O acompanhamento foi pausado; use Atualizar status para retomar.` }); }
    finally {
      refreshing = false;
      const current = get().simulation;
      if (current && current.id !== simulation.id && !terminal(current.status)) timer = setTimeout(() => void get().refresh(), 1000);
    }
  },
  async track(id) {
    if (get().busy) return;
    if (!isSimulationId(id)) { set({ error: 'Informe um identificador válido de simulação (sim_…).' }); return; }
    set({ busy: true, error: undefined });
    try {
      const simulation = await new SimulationApi().status(id);
      clearTimeout(timer);
      set({ simulation, attempt: undefined, summary: undefined, diagnostics: undefined, artifacts: undefined, logs: undefined });
      remember(undefined, simulation);
    } catch (e) { set({ error: errorText(e) }); }
    finally { set({ busy: false }); }
    if (get().simulation?.id === id) await get().refresh();
  },
  async cancel() {
    const { simulation, busy } = get(); if (!simulation || busy) return;
    clearTimeout(timer); set({ busy: true, error: undefined });
    try {
      const updated = await new SimulationApi().cancel(simulation.id);
      set({ simulation: updated }); remember(get().attempt, updated);
    } catch (e) { set({ error: errorText(e) }); }
    finally { set({ busy: false }); }
    await get().refresh();
  },
  async loadResults() {
    const { simulation } = get(); if (!simulation || !terminal(simulation.status)) return;
    const api = new SimulationApi();
    const [summary, diagnostics, artifacts, logs] = await Promise.allSettled([
      simulation.status === 'succeeded' ? api.summary(simulation.id) : Promise.resolve(undefined), api.diagnostics(simulation.id), api.artifacts(simulation.id), api.logs(simulation.id),
    ]);
    if (get().simulation?.id !== simulation.id) return;
    set({ summary: summary.status === 'fulfilled' ? summary.value : undefined,
      diagnostics: diagnostics.status === 'fulfilled' ? diagnostics.value : undefined,
      artifacts: artifacts.status === 'fulfilled' ? artifacts.value : undefined,
      logs: logs.status === 'fulfilled' ? logs.value : undefined,
      error: [summary, diagnostics, artifacts, logs].filter(r => r.status === 'rejected').map(r => errorText((r as PromiseRejectedResult).reason)).join(' ') || undefined });
  },
}));
