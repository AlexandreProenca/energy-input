import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore as auth } from '../authStore';
import { SimulationApi } from '@/features/simulation/api';
import { useSimulationStore } from '@/features/simulation/simulationStore';

const sessao = (tenant = 'tnt_a', token = 'tok-1', expires_in = 900) => ({
  access_token: token, token_type: 'Bearer', expires_in, scope: 'simulations:write',
  usuario: { id: 'usr_1', nome: 'Ana', email: 'ana@exemplo.com', papel: 'member' },
  tenant: { id: tenant, nome: `Org ${tenant}` },
});

let armazenado: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers();
  armazenado = new Map();
  const storage = { setItem: (k: string, v: string) => armazenado.set(k, v), getItem: (k: string) => armazenado.get(k) ?? null, removeItem: (k: string) => armazenado.delete(k) };
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('localStorage', storage);
  auth.setState({ estado: 'verificando', sessao: undefined, telaAberta: false, enviando: false, recusa: undefined, tenants: undefined });
  useSimulationStore.setState({ simulation: undefined, attempt: undefined });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const rotas = (tabela: Record<string, () => Response>) => {
  const fetch = vi.fn(async (url: string) => {
    const caminho = String(url).replace('/simulation-api/v1', '');
    return (tabela[caminho] ?? (() => Response.json({}, { status: 404 })))();
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

describe('sessão do navegador', () => {
  it('recupera a sessão pelo cookie ao abrir, sem pedir login', async () => {
    rotas({ '/auth/refresh': () => Response.json(sessao()) });
    await auth.getState().iniciar();
    expect(auth.getState()).toMatchObject({ estado: 'autenticado', sessao: { token: 'tok-1', tenant: { id: 'tnt_a' } } });
  });

  it('sem cookie válido, fica anônimo', async () => {
    rotas({ '/auth/refresh': () => Response.json({ detail: 'x' }, { status: 401 }) });
    await auth.getState().iniciar();
    expect(auth.getState().estado).toBe('anonimo');
  });

  it('entra com e-mail e senha, manda JSON com cookie da mesma origem, e fecha a tela', async () => {
    const fetch = rotas({ '/auth/login': () => Response.json(sessao()) });
    auth.getState().abrirLogin();
    expect(await auth.getState().entrar(' ana@exemplo.com ', 'segredo-123')).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/simulation-api/v1/auth/login');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'ana@exemplo.com', password: 'segredo-123' });
    expect(auth.getState()).toMatchObject({ estado: 'autenticado', telaAberta: false });
  });

  it('nunca grava token nem senha no armazenamento do navegador', async () => {
    rotas({ '/auth/login': () => Response.json(sessao()) });
    await auth.getState().entrar('ana@exemplo.com', 'segredo-123');
    const tudo = [...armazenado.values()].join(' ');
    expect(tudo).not.toContain('tok-1');
    expect(tudo).not.toContain('segredo-123');
    expect(JSON.stringify(auth.getState())).not.toContain('segredo-123');
  });

  it('401 vira recusa única, e a tela continua aberta', async () => {
    rotas({ '/auth/login': () => Response.json({ detail: 'senha errada' }, { status: 401 }) });
    auth.getState().abrirLogin();
    expect(await auth.getState().entrar('ana@exemplo.com', 'x')).toBe(false);
    expect(auth.getState()).toMatchObject({ estado: 'verificando', telaAberta: true, recusa: { tipo: 'credenciais' } });
  });

  it('409 pede o tenant, e o segundo envio o leva', async () => {
    const fetch = rotas({ '/auth/login': () => Response.json({ tenants: [{ id: 'tnt_a', nome: 'A' }, { id: 'tnt_b', nome: 'B' }] }, { status: 409 }) });
    await auth.getState().entrar('ana@exemplo.com', 'x');
    expect(auth.getState().tenants?.map((t) => t.id)).toEqual(['tnt_a', 'tnt_b']);
    fetch.mockImplementationOnce(async () => Response.json(sessao('tnt_b')));
    await auth.getState().entrar('ana@exemplo.com', 'x', 'tnt_b');
    expect(JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ tenant_id: 'tnt_b' });
    expect(auth.getState()).toMatchObject({ estado: 'autenticado', tenants: undefined, sessao: { tenant: { id: 'tnt_b' } } });
  });

  it('renova sozinho um minuto antes de o token vencer', async () => {
    let n = 0;
    const fetch = rotas({ '/auth/login': () => Response.json(sessao()), '/auth/refresh': () => Response.json(sessao('tnt_a', `tok-${++n + 1}`)) });
    await auth.getState().entrar('ana@exemplo.com', 'x');
    await vi.advanceTimersByTimeAsync(839_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(auth.getState().sessao?.token).toBe('tok-2');
  });

  it('pedidos simultâneos com token vencido fazem uma renovação só', async () => {
    // Duas renovações concorrentes gastariam o mesmo cookie duas vezes, e a rotação do serviço
    // trataria a segunda como reuso — derrubando a sessão.
    const fetch = rotas({ '/auth/refresh': () => Response.json(sessao()) });
    const [a, b, c] = await Promise.all([auth.getState().renovar(), auth.getState().renovar(), auth.getState().renovar()]);
    expect([a, b, c]).toEqual([true, true, true]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falha de rede na renovação não derruba a sessão', async () => {
    rotas({ '/auth/login': () => Response.json(sessao()) });
    await auth.getState().entrar('ana@exemplo.com', 'x');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('rede'); }));
    expect(await auth.getState().renovar()).toBe(false);
    expect(auth.getState().estado).toBe('autenticado');
  });

  it('sair revoga no serviço e esquece a execução da conta', async () => {
    const fetch = rotas({ '/auth/login': () => Response.json(sessao()), '/auth/logout': () => new Response(null, { status: 204 }) });
    await auth.getState().entrar('ana@exemplo.com', 'x');
    useSimulationStore.setState({ simulation: { id: 'sim_x', model_version_id: 'mv', status: 'succeeded', run_type: 'annual', engine_version: '26.1.0' } });
    armazenado.set('energy-input:simulation:v1', '{"simulation":{"id":"sim_x"}}');
    await auth.getState().sair();
    expect(auth.getState()).toMatchObject({ estado: 'anonimo', sessao: undefined });
    expect(useSimulationStore.getState().simulation).toBeUndefined();
    expect(armazenado.has('energy-input:simulation:v1')).toBe(false);
    expect((fetch.mock.calls.at(-1) as unknown as [string])[0]).toBe('/simulation-api/v1/auth/logout');
  });

  it('entrar em outra organização esquece a execução da anterior', async () => {
    rotas({ '/auth/login': () => Response.json(sessao('tnt_a')) });
    await auth.getState().entrar('ana@exemplo.com', 'x');
    useSimulationStore.setState({ simulation: { id: 'sim_x', model_version_id: 'mv', status: 'succeeded', run_type: 'annual', engine_version: '26.1.0' } });
    rotas({ '/auth/login': () => Response.json(sessao('tnt_b')) });
    await auth.getState().entrar('ana@exemplo.com', 'x', 'tnt_b');
    expect(useSimulationStore.getState().simulation).toBeUndefined();
  });

  it('o cliente da API usa o token da sessão', async () => {
    const fetch = rotas({ '/auth/login': () => Response.json(sessao()), '/engines': () => Response.json({ engines: [], default: '' }) });
    await auth.getState().entrar('ana@exemplo.com', 'x');
    await new SimulationApi().engines();
    const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-1');
  });
});
