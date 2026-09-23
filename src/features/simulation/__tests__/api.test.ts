import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationApi, SimulationApiError, terminal } from '../api';
afterEach(() => vi.unstubAllGlobals());
describe('cliente da API de simulação', () => {
  it('envia multipart com file e Bearer, sem definir boundary manualmente', async () => {
    const fetch = vi.fn(async () => Response.json({ versao: { id: 'version' } })); vi.stubGlobal('fetch', fetch);
    await new SimulationApi('Bearer credencial').uploadModel('{"Building":{}}', 'modelo.epJSON');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/simulation-api/v1/models');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer credencial');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    const file = (init.body as FormData).get('file') as File;
    expect(file.name.toLowerCase()).toBe('modelo.epjson'); expect(await file.text()).toBe('{"Building":{}}');
  });
  it('sem chave, o navegador não manda autorização — o proxy a injeta do ambiente (T027)', async () => {
    // É o caminho do app desde a T027: a chave mora em SIMULATION_API_TOKEN, no servidor, e o
    // cliente é construído sem ela. Um cabeçalho vindo do navegador seria sinal de que alguma
    // credencial voltou a passar pela interface.
    const fetch = vi.fn(async () => Response.json({ engines: [] })); vi.stubGlobal('fetch', fetch);
    await new SimulationApi().engines();
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });

  it('o 401 diz onde configurar a chave, e não pede para digitá-la', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: 'x' }, { status: 401 })));
    const erro = await new SimulationApi().engines().catch((e) => e);
    expect(erro.message).toContain('SIMULATION_API_TOKEN');
    expect(erro.message).not.toMatch(/digite|informe a chave|configure a conexão/i);
  });
  it('preserva chave idempotente e versão imutável ao retomar a mesma requisição', async () => {
    const fetch = vi.fn(async () => Response.json({ id: 'sim-test', status: 'queued' })); vi.stubGlobal('fetch', fetch);
    const api = new SimulationApi();
    const body = { model_version_id: 'versao-original', engine_version: '26.1.0', run_type: 'annual' as const, weather_id: 'wx_clima', options: { sqlite: true, readvars: false, expand_objects: false } };
    await api.create(body, 'mesma-chave'); await api.create(body, 'mesma-chave');
    for (const call of fetch.mock.calls) {
      const [, init] = call as unknown as [string, RequestInit];
      expect(new Headers(init.headers).get('Idempotency-Key')).toBe('mesma-chave');
      expect(JSON.parse(init.body as string)).toEqual(body);
    }
  });
  it('explica erros estruturados e preserva Retry-After para limitação', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: 'Limite excedido', request_id: 'req1', errors: [{ field: 'scope', message: 'sem permissão' }] }, { status: 429, headers: { 'Retry-After': '15' } })));
    await expect(new SimulationApi().engines()).rejects.toMatchObject({ status: 429, retryAfter: 15, message: 'Limite excedido scope: sem permissão Referência: req1' });
  });
  it('explica 401 e falha de rede sem expor credenciais', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    // A mensagem mudou na T027 (a chave vem do ambiente do servidor); o que este teste
    // protege continua: a credencial nunca aparece na mensagem.
    await expect(new SimulationApi('segredo').engines()).rejects.toThrow('SIMULATION_API_TOKEN');
    await expect(new SimulationApi('segredo').engines()).rejects.not.toThrow('segredo');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('segredo'); }));
    await expect(new SimulationApi('segredo').engines()).rejects.toBeInstanceOf(SimulationApiError);
    await expect(new SimulationApi('segredo').engines()).rejects.not.toThrow('segredo');
  });
  it('trata todos os estados terminais e codifica os nomes dos arquivos', async () => {
    expect(['succeeded', 'failed', 'cancelled', 'timeout'].every(terminal)).toBe(true);
    expect(terminal('running')).toBe(false); expect(terminal('queued')).toBe(false);
    const fetch = vi.fn(async () => Response.json({ download_url: 'https://storage.example/file' })); vi.stubGlobal('fetch', fetch);
    await new SimulationApi().download('sim-test', 'relatório final.htm');
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toContain('relat%C3%B3rio%20final.htm');
  });
});
