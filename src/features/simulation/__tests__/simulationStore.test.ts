import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SimulationApi, SimulationApiError, type Simulation } from '../api';
import { useSimulationStore as store } from '../simulationStore';
import { useDocumentStore as document } from '@/store/documentStore';
const sim = (status: string): Simulation => ({ id: 'sim-original', model_version_id: 'mv-original', status, run_type: 'design_day', engine_version: '26.1.0' });
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('crypto', { randomUUID });
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { setItem: (k: string, v: string) => values.set(k, v), getItem: (k: string) => values.get(k) ?? null, removeItem: (k: string) => values.delete(k) });
  store.setState({ busy: false, attempt: undefined, simulation: undefined, error: undefined, summary: undefined, diagnostics: undefined, artifacts: undefined, resultadosDe: undefined });
  document.getState().reset({ Building: { Original: {} } }, 'original.epJSON');
  vi.spyOn(SimulationApi.prototype, 'uploadModel').mockResolvedValue({ id: 'mdl-original', versao: { id: 'mv-original', versao_do_motor: '26.1.0' } });
  vi.spyOn(SimulationApi.prototype, 'logs').mockResolvedValue({ status: 'succeeded', attempts: 1, events: [], err_available: true });
  vi.spyOn(SimulationApi.prototype, 'summary').mockResolvedValue({ run_type: 'design_day', end_uses: [], peak_demand: [], building_area: [], comfort: [] });
  vi.spyOn(SimulationApi.prototype, 'diagnostics').mockResolvedValue({ available: true, entries: [] });
  vi.spyOn(SimulationApi.prototype, 'artifacts').mockResolvedValue({ complete: true, itens: [] });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('acompanhamento (T028)', () => {
  it('marca de qual execução os resultados já foram consultados', async () => {
    vi.spyOn(SimulationApi.prototype, 'create').mockResolvedValue(sim('queued'));
    vi.spyOn(SimulationApi.prototype, 'status').mockResolvedValue(sim('succeeded'));
    await store.getState().start('26.1.0', 'design_day');
    expect(store.getState().resultadosDe).toBe('sim-original');
  });

  it('continua marcando mesmo quando uma das consultas falha', async () => {
    // Senão a etapa "Resultados" ficaria girando para sempre ao lado da mensagem de erro.
    vi.spyOn(SimulationApi.prototype, 'create').mockResolvedValue(sim('queued'));
    vi.spyOn(SimulationApi.prototype, 'status').mockResolvedValue(sim('succeeded'));
    vi.spyOn(SimulationApi.prototype, 'summary').mockRejectedValue(new SimulationApiError('Fora do ar', 503));
    await store.getState().start('26.1.0', 'design_day');
    expect(store.getState().resultadosDe).toBe('sim-original');
    expect(store.getState().error).toContain('Fora do ar');
  });

});
describe('ciclo de vida da simulação', () => {
  it('retoma a mesma versão após perda de resposta, mesmo se o usuário editar o documento', async () => {
    const create = vi.spyOn(SimulationApi.prototype, 'create').mockRejectedValueOnce(new SimulationApiError('Rede', 0)).mockResolvedValueOnce(sim('queued'));
    vi.spyOn(SimulationApi.prototype, 'status').mockResolvedValue(sim('succeeded'));
    await store.getState().start('26.1.0', 'design_day');
    const original = store.getState().attempt!;
    document.getState().commit({ Building: { Editado: {} } }, 'Editar');
    await store.getState().retry();
    expect(SimulationApi.prototype.uploadModel).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(create.mock.calls[1][1]).toBe(original.key);
    expect(store.getState().simulation?.status).toBe('succeeded');
    expect(document.getState().doc.Building.Editado).toEqual({});
    // A interface não guarda credencial nenhuma desde a T027: a chave vem do ambiente do
    // servidor. Nem no estado, nem no que vai para o sessionStorage.
    expect('token' in store.getState()).toBe(false);
    expect(sessionStorage.getItem('energy-input:simulation:v1') ?? '').not.toMatch(/token|authorization|bearer/i);
  });
  it('consulta sequencialmente e para ao chegar a um estado terminal', async () => {
    vi.spyOn(SimulationApi.prototype, 'create').mockResolvedValue(sim('queued'));
    const status = vi.spyOn(SimulationApi.prototype, 'status').mockResolvedValueOnce(sim('running')).mockResolvedValueOnce(sim('failed'));
    await store.getState().start('26.1.0', 'design_day');
    expect(status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(status).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30000);
    expect(status).toHaveBeenCalledTimes(2);
    expect(SimulationApi.prototype.summary).not.toHaveBeenCalled();
    expect(SimulationApi.prototype.diagnostics).toHaveBeenCalledWith('sim-original');
  });
  it('não envia período climático sem EPW e não duplica uma simulação em andamento', async () => {
    await store.getState().start('26.1.0', 'annual');
    expect(SimulationApi.prototype.uploadModel).not.toHaveBeenCalled();
    expect(store.getState().error).toContain('EPW');
    store.setState({ simulation: sim('running') });
    await store.getState().start('26.1.0', 'design_day');
    expect(SimulationApi.prototype.uploadModel).not.toHaveBeenCalled();
  });
});
