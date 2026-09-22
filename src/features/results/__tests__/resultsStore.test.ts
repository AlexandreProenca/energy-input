import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationApi, SimulationApiError, type Simulation } from '@/features/simulation/api';
import { useSimulationStore } from '@/features/simulation/simulationStore';
import { useResultsStore } from '../resultsStore';

const sim = (id: string): Simulation => ({
  id, model_version_id: 'mv_01M2KXB16RP92SR9SCA3PBVMSF', status: 'succeeded',
  run_type: 'annual', engine_version: '26.1.0',
});
const A = sim('sim_01M2NEQ31DJ09TKRQF3V600V42');
const B = sim('sim_01M2KXZQ8HMGH0MPEG8VN9FP7A');

/** Resposta de série que demora `ms` e respeita o cancelamento. */
const lenta = (ms: number) => (_id: string, _q: unknown, _max?: number, signal?: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new SimulationApiError('não registrou', 422)), ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('abortado', 'AbortError')); });
  });

beforeEach(() => {
  useResultsStore.getState().limpar();
  useSimulationStore.setState({ simulation: A, token: '' });
  vi.restoreAllMocks();
});

describe('carga de medidores', () => {
  it('trocar de execução no meio da carga não trava o painel', async () => {
    // Era o defeito: a carga antiga abandonava sem repor `carregando: false`, e um guarda
    // por `carregando` impedia a nova de começar — "Lendo os medidores…" para sempre.
    vi.spyOn(SimulationApi.prototype, 'allTimeseries').mockImplementation(lenta(30) as never);

    const primeira = useResultsStore.getState().carregarMedidores();
    await new Promise((r) => setTimeout(r, 10));
    useSimulationStore.setState({ simulation: B });
    const segunda = useResultsStore.getState().carregarMedidores();
    await Promise.all([primeira, segunda]);

    expect(useResultsStore.getState().carregando).toBe(false);
    expect(useResultsStore.getState().simulationId).toBe(B.id);
  });

  it('a carga abandonada não escreve suas séries sobre a nova', async () => {
    const serie = (nome: string) => ({
      variable: { name: nome, key: '', frequency: 'hourly' as const, units: 'J', aggregation: 'Sum', is_meter: true },
      utc_offset_hours: -3,
      itens: [{ timestamp: null, month: 1, day: 1, hour: 1, minute: 0, value: 1 }],
      completa: true,
      paginas: 1,
    });
    vi.spyOn(SimulationApi.prototype, 'allTimeseries').mockImplementation(
      (async (id: string) => {
        await new Promise((r) => setTimeout(r, 5));
        return serie(id === A.id ? 'DA_ANTIGA' : 'DA_NOVA');
      }) as never,
    );

    const primeira = useResultsStore.getState().carregarMedidores();
    useSimulationStore.setState({ simulation: B });
    const segunda = useResultsStore.getState().carregarMedidores();
    await Promise.all([primeira, segunda]);

    const nomes = useResultsStore.getState().medidores.map((m) => m.variable.name);
    expect(nomes.every((n) => n === 'DA_NOVA')).toBe(true);
  });

  it('não busca série de execução que não concluiu', async () => {
    // O serviço responde 409 antes de `succeeded`; pedir transformaria um estado normal da
    // interface em erro.
    const spy = vi.spyOn(SimulationApi.prototype, 'allTimeseries');
    useSimulationStore.setState({ simulation: { ...A, status: 'running' } });
    await useResultsStore.getState().carregarMedidores();
    expect(spy).not.toHaveBeenCalled();
  });

  it('422 conta como ausência esperada, não como erro', async () => {
    vi.spyOn(SimulationApi.prototype, 'allTimeseries')
      .mockRejectedValue(new SimulationApiError('a simulação não registrou', 422) as never);
    await useResultsStore.getState().carregarMedidores();
    const s = useResultsStore.getState();
    expect(s.erro).toBeUndefined();
    expect(s.ausentes.length).toBeGreaterThan(0);
    expect(s.medidores).toEqual([]);
  });

  it('410 marca a série como expirada e para de procurar', async () => {
    const spy = vi.spyOn(SimulationApi.prototype, 'allTimeseries')
      .mockRejectedValue(new SimulationApiError('expirou', 410) as never);
    await useResultsStore.getState().carregarMedidores();
    expect(useResultsStore.getState().expirada).toBe(true);
    // Insistir nos outros seis medidores seria desperdício: a retenção vale para a execução.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('carga de temperaturas', () => {
  const serieDe = (nome: string, key: string) => ({
    variable: { name: nome, key, frequency: 'hourly' as const, units: 'C', aggregation: 'Avg', is_meter: false },
    utc_offset_hours: -3,
    itens: [{ timestamp: null, month: 1, day: 1, hour: 1, minute: 0, value: 22 }],
    completa: true,
    paginas: 1,
  });

  it('carrega a externa junto, e o signal compartilhado não a cancela', async () => {
    // As duas consultas usam o mesmo AbortController, de propósito: ele só dispara quando
    // uma carga mais nova assume. Sequencialmente, o sinal não está abortado.
    vi.spyOn(SimulationApi.prototype, 'allTimeseries').mockImplementation(
      (async (_id: string, q: { variable: string }) => serieDe(q.variable, 'ZONE ONE')) as never,
    );
    await useResultsStore.getState().carregarTemperaturas();
    const s = useResultsStore.getState();
    expect(s.interna?.variable.name).toBe('Zone Operative Temperature');
    expect(s.externa?.variable.name).toBe('Site Outdoor Air Drybulb Temperature');
  });

  it('a externa ausente não invalida o painel', async () => {
    // Ela só é necessária para a faixa adaptativa; a fixa continua valendo.
    vi.spyOn(SimulationApi.prototype, 'allTimeseries').mockImplementation(
      (async (_id: string, q: { variable: string }) => {
        if (q.variable.startsWith('Site')) throw new SimulationApiError('não registrou', 422);
        return serieDe(q.variable, 'ZONE ONE');
      }) as never,
    );
    await useResultsStore.getState().carregarTemperaturas();
    expect(useResultsStore.getState().interna).toBeDefined();
    expect(useResultsStore.getState().externa).toBeUndefined();
  });

  it('escolher uma zona que falha mostra o erro, em vez de voltar ao seletor em laço', async () => {
    // Repor a lista de candidatas e limpar a escolha devolveria o usuário ao seletor para
    // escolher de novo, indefinidamente.
    const ambiguo = new SimulationApiError('ambígua', 422, 0, {
      errors: [{ field: 'key', message: 'ZONA 1' }, { field: 'key', message: 'ZONA 2' }],
    });
    vi.spyOn(SimulationApi.prototype, 'allTimeseries').mockRejectedValue(ambiguo as never);

    await useResultsStore.getState().carregarTemperaturas();
    expect(useResultsStore.getState().zonas).toEqual(['ZONA 1', 'ZONA 2']);

    await useResultsStore.getState().carregarTemperaturas('ZONA 1');
    const s = useResultsStore.getState();
    expect(s.erro).toBeDefined();
    expect(s.zonaEscolhida).toBe('ZONA 1');
  });
});
