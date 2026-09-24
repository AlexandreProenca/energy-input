import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationApi, SimulationApiError, terminal, usarCredencial } from '../api';
afterEach(() => { vi.unstubAllGlobals(); usarCredencial(undefined); });
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
  it('no navegador, manda o token da sessão (T032)', async () => {
    const fetch = vi.fn(async () => Response.json({ engines: [] })); vi.stubGlobal('fetch', fetch);
    usarCredencial({ token: () => 'token-da-sessao', renovar: async () => false });
    await new SimulationApi().engines();
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-da-sessao');
  });

  it('sem sessão, não manda autorização nenhuma', async () => {
    const fetch = vi.fn(async () => Response.json({ engines: [] })); vi.stubGlobal('fetch', fetch);
    usarCredencial({ token: () => undefined, renovar: async () => false });
    await new SimulationApi().engines();
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });

  it('com token vencido, renova uma vez e repete o pedido com o token novo', async () => {
    let token = 'vencido';
    const fetch = vi.fn(async (_url: string, init: RequestInit) =>
      new Headers(init.headers).get('Authorization') === 'Bearer novo' ? Response.json({ engines: [], default: '' }) : Response.json({}, { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    const renovar = vi.fn(async () => { token = 'novo'; return true; });
    usarCredencial({ token: () => token, renovar });
    await expect(new SimulationApi().engines()).resolves.toEqual({ engines: [], default: '' });
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('não entra em laço quando a renovação não resolve', async () => {
    // Renovar "com sucesso" e o serviço seguir recusando (papel mudou, relógio errado): uma
    // repetição só, e o 401 chega a quem chamou.
    const fetch = vi.fn(async () => Response.json({}, { status: 401 })); vi.stubGlobal('fetch', fetch);
    const renovar = vi.fn(async () => true);
    usarCredencial({ token: () => 't', renovar });
    const erro = await new SimulationApi().engines().catch((e) => e);
    expect(erro.status).toBe(401);
    expect(erro.message).toMatch(/Entre de novo/);
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('token passado por script não tenta renovar pela sessão do navegador', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 401 })));
    const renovar = vi.fn(async () => true);
    usarCredencial({ token: () => 'sessao', renovar });
    await new SimulationApi('token-do-script').engines().catch(() => undefined);
    expect(renovar).not.toHaveBeenCalled();
  });

  it('o 401 pede para entrar de novo, e não fala mais em chave no servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: 'x' }, { status: 401 })));
    const erro = await new SimulationApi().engines().catch((e) => e);
    expect(erro.message).toMatch(/Entre de novo com seu e-mail e senha/);
    expect(erro.message).not.toContain('SIMULATION_API_TOKEN');
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
    // A mensagem mudou na T027 e na T032; o que este teste protege continua: a credencial nunca
    // aparece na mensagem.
    await expect(new SimulationApi('segredo').engines()).rejects.toThrow('Entre de novo');
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
