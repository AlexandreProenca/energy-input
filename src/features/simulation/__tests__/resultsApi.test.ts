import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationApi, SimulationApiError, isSeriesExpired, seriesCandidates } from '../api';
import type { TimeSeries, VariableCatalog } from '../api';
import serie from '@/core/results/__fixtures__/serie-temperatura-operativa.json';
import catalogo from '@/core/results/__fixtures__/catalogo-variaveis.json';
import erro422 from '@/core/results/__fixtures__/erro-422-variavel-inexistente.json';

const SIM = 'sim_01M2KXB9D4TQ7F3S0YJ8N5VZQK';

afterEach(() => vi.unstubAllGlobals());

/** Responde a mesma fixture a cada chamada, e guarda as URLs pedidas. */
function stubFetch(body: unknown, init?: ResponseInit) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const urlDe = (fetch: ReturnType<typeof stubFetch>, i = 0) => (fetch.mock.calls[i] as unknown as [string])[0];

describe('catálogo de variáveis', () => {
  it('monta a URL com limite e cursor', async () => {
    const fetch = stubFetch(catalogo);
    await new SimulationApi().variables(SIM, { limit: 200, cursor: 'MTI4NHxab25l' });
    expect(urlDe(fetch)).toBe(`/simulation-api/v1/simulations/${SIM}/results/variables?limit=200&cursor=MTI4NHxab25l`);
  });

  it('a fixture real satisfaz o tipo declarado', async () => {
    stubFetch(catalogo);
    const pagina: VariableCatalog = await new SimulationApi().variables(SIM);
    expect(pagina.sources).toEqual(['rdd', 'mdd']);
    expect(pagina.items[0]?.type).toBe('variable');
    expect(pagina.total).toBeGreaterThan(pagina.returned);
  });
});

describe('série temporal', () => {
  it('codifica espaço e acento nos parâmetros', async () => {
    // Nomes de zona neste projeto são em pt-BR, com espaço e acento: se a codificação
    // escapar, o serviço recebe outra chave e responde 422 "variável inexistente" —
    // um erro que parece de dado e é de transporte.
    const fetch = stubFetch(serie);
    await new SimulationApi().timeseries(SIM, {
      variable: 'Zone Operative Temperature',
      key: 'Pavimento Térreo',
      frequency: 'hourly',
      limit: 10000,
    });
    const url = urlDe(fetch);
    expect(url).toContain('variable=Zone+Operative+Temperature');
    expect(url).toContain('key=Pavimento+T%C3%A9rreo');
    expect(url).toContain('frequency=hourly');
    expect(url).toContain('limit=10000');
  });

  it('omite os parâmetros não informados em vez de mandá-los vazios', async () => {
    // `key=` vazio não é o mesmo que ausente: com ele o serviço procuraria a chave "".
    const fetch = stubFetch(serie);
    await new SimulationApi().timeseries(SIM, { variable: 'Electricity:Facility' });
    expect(urlDe(fetch)).toBe(`/simulation-api/v1/simulations/${SIM}/results/timeseries?variable=Electricity%3AFacility`);
  });

  it('repassa `limit: 0` em vez de engolir, para o serviço recusar com clareza', async () => {
    // O contrato exige mínimo 1. Omitir faria o serviço aplicar o default de 10 000, e quem
    // pediu 0 receberia 10 000 pontos sem saber por quê.
    const fetch = stubFetch(serie);
    await new SimulationApi().timeseries(SIM, { variable: 'X', limit: 0 });
    expect(urlDe(fetch)).toContain('limit=0');
  });

  it('a fixture real satisfaz o tipo declarado, inclusive a hora 24', async () => {
    stubFetch(serie);
    const pagina: TimeSeries = await new SimulationApi().timeseries(SIM, { variable: 'Zone Operative Temperature' });
    expect(pagina.variable.frequency).toBe('hourly');
    expect(pagina.variable.is_meter).toBe(false);
    expect(pagina.utc_offset_hours).toBe(-3);
    expect(pagina.itens.some(p => p.hour === 24)).toBe(true);
  });
});

describe('paginação de série', () => {
  it('segue o cursor até o fim e concatena na ordem', async () => {
    const pagina = (itens: number[], cursor: string | null) => ({
      ...serie,
      itens: itens.map(value => ({ timestamp: null, month: 1, day: 1, hour: value, minute: 0, value })),
      proximo_cursor: cursor,
    });
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(pagina([1, 2], 'c1')))
      .mockResolvedValueOnce(Response.json(pagina([3, 4], 'c2')))
      .mockResolvedValueOnce(Response.json(pagina([5], null)));
    vi.stubGlobal('fetch', fetch);

    const todas = await new SimulationApi().allTimeseries(SIM, { variable: 'X' });
    expect(todas.itens.map(p => p.value)).toEqual([1, 2, 3, 4, 5]);
    expect(todas.completa).toBe(true);
    expect(todas.paginas).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(3);
    // O cursor da página anterior entra na consulta seguinte, sem perder os demais filtros.
    expect(urlDe(fetch, 1)).toContain('cursor=c1');
    expect(urlDe(fetch, 1)).toContain('variable=X');
  });

  it('interrompe no cursor que se repete, sem duplicar pontos', async () => {
    // Só o teto de páginas deixaria concatenar N cópias da mesma página: a série sairia
    // com pontos duplicados e o gráfico, plausível e errado. Pior que devolver pouco.
    const ponto = { timestamp: null, month: 1, day: 1, hour: 1, minute: 0, value: 1 };
    const fetch = vi.fn(async () => Response.json({ ...serie, itens: [ponto], proximo_cursor: 'sempre' }));
    vi.stubGlobal('fetch', fetch);
    const todas = await new SimulationApi().allTimeseries(SIM, { variable: 'X' }, 12);
    // Primeira página + uma segunda com o mesmo cursor, e para: 2 chamadas, não 12.
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(todas.itens).toHaveLength(2);
    expect(todas.completa).toBe(false);
  });

  it('para no teto de páginas quando o cursor muda mas nunca acaba', async () => {
    let n = 0;
    const fetch = vi.fn(async () => Response.json({ ...serie, itens: [], proximo_cursor: `c${n++}` }));
    vi.stubGlobal('fetch', fetch);
    const todas = await new SimulationApi().allTimeseries(SIM, { variable: 'X' }, 3);
    expect(todas.paginas).toBe(3);
    expect(todas.completa).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('não faz uma segunda chamada quando o ano inteiro veio numa página', async () => {
    // É o caso real: 8 760 pontos com `proximo_cursor: null`.
    const fetch = stubFetch(serie);
    const todas = await new SimulationApi().allTimeseries(SIM, { variable: 'Zone Operative Temperature' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(todas.completa).toBe(true);
    expect(todas.itens.length).toBe(serie.itens.length);
  });
});

describe('erros próprios das séries', () => {
  it('trata 410 como série expirada, com mensagem que aponta o resumo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: 'sql expirado' }, { status: 410 })));
    const erro = await new SimulationApi().timeseries(SIM, { variable: 'X' }).catch(e => e);
    expect(isSeriesExpired(erro)).toBe(true);
    expect(erro.message).toContain('O resumo permanente continua disponível');
    // Não pode ser confundido com 404: a simulação existe, o que sumiu foi o `.sql`.
    expect(isSeriesExpired(new SimulationApiError('x', 404))).toBe(false);
  });

  it('preserva o corpo do 422 para que as candidatas cheguem ao chamador', async () => {
    // O `request` achata o erro numa mensagem; sem o corpo estruturado, o seletor de
    // séries não teria como oferecer as chaves — o catálogo não as traz.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(erro422, { status: 422 })));
    const erro = await new SimulationApi().timeseries(SIM, { variable: 'Electricity:Facility' }).catch(e => e);
    expect(erro.status).toBe(422);
    expect(erro.problem?.detail).toBe('variável inexistente nesta simulação');
    // Variável não registrada não tem candidatas. Esta asserção travava o contrário — a
    // mensagem de erro devolvida como se fosse uma zona —, e escondeu o defeito que apareceu
    // na primeira execução com duas zonas (T025).
    expect(seriesCandidates(erro)).toEqual([]);
    expect(seriesCandidates(new SimulationApiError('x', 500))).toEqual([]);
  });

  it('não vaza a credencial na mensagem de erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: 'falhou' }, { status: 500 })));
    const erro = await new SimulationApi('segredo').timeseries(SIM, { variable: 'X' }).catch(e => e);
    expect(String(erro.message)).not.toContain('segredo');
    // `problem` é superfície nova desta tarefa: ele carrega o corpo cru da resposta, então
    // precisa entrar na mesma garantia que a mensagem já tinha.
    expect(JSON.stringify(erro.problem ?? {})).not.toContain('segredo');
  });
});
