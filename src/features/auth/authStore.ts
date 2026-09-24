import { create } from 'zustand';
import { lerRecusa, lerSessao, quandoRenovar, type Recusa, type Sessao, type TenantDaSessao } from '@/core/auth/sessao';
import { usarCredencial } from '@/features/simulation/api';
import { useSimulationStore } from '@/features/simulation/simulationStore';

/**
 * A sessão de quem entrou (T032, ADR-0004).
 *
 * **O token de acesso vive só aqui, na memória da aba** — nunca em localStorage nem
 * sessionStorage, onde qualquer script da página o leria. O que sobrevive ao recarregar é o
 * refresh token, num cookie HttpOnly que o JavaScript não vê: ao abrir, o app pede uma
 * renovação, e se o cookie for válido a pessoa continua dentro sem digitar nada.
 *
 * A senha passa por `entrar` e não fica em lugar nenhum.
 */

const BASE = '/simulation-api/v1/auth';

export type EstadoDaSessao = 'verificando' | 'anonimo' | 'autenticado';

interface AuthState {
  estado: EstadoDaSessao;
  sessao?: Sessao;
  /** A tela de login está aberta. */
  telaAberta: boolean;
  enviando: boolean;
  recusa?: Recusa;
  /** Organizações entre as quais escolher, quando a conta está em mais de uma. */
  tenants?: TenantDaSessao[];
  iniciar: () => Promise<void>;
  entrar: (email: string, senha: string, tenantId?: string) => Promise<boolean>;
  renovar: () => Promise<boolean>;
  sair: () => Promise<void>;
  abrirLogin: () => void;
  fecharLogin: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let renovando: Promise<boolean> | undefined;

async function postar(caminho: string, corpo: unknown): Promise<Response | undefined> {
  try {
    // JSON sempre, mesmo em `{}`: é o que obriga um preflight vindo de outra origem, somado ao
    // SameSite=Strict do cookie (eng-energy-plus#146).
    return await fetch(`${BASE}/${caminho}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return undefined;
  }
}

/**
 * Outra conta, ou nenhuma: a execução acompanhada pertence ao tenant anterior, e o serviço
 * responderia 404 para ela — ou, pior, a interface a mostraria a quem não é dono.
 */
function esquecerExecucao() {
  try { sessionStorage.removeItem('energy-input:simulation:v1'); } catch { /* indisponível */ }
  useSimulationStore.setState({ simulation: undefined, attempt: undefined, summary: undefined, diagnostics: undefined, artifacts: undefined, logs: undefined, resultadosDe: undefined, error: undefined, canRestart: false });
}

export const useAuthStore = create<AuthState>((set, get) => {
  const agendar = (sessao: Sessao) => {
    clearTimeout(timer);
    timer = setTimeout(() => void get().renovar(), quandoRenovar(sessao, Date.now()));
  };
  const aceitar = (sessao: Sessao) => {
    const anterior = get().sessao;
    if (anterior && anterior.tenant.id !== sessao.tenant.id) esquecerExecucao();
    set({ estado: 'autenticado', sessao, recusa: undefined, tenants: undefined, telaAberta: false });
    agendar(sessao);
  };
  const encerrar = () => {
    clearTimeout(timer);
    const tinha = !!get().sessao;
    set({ estado: 'anonimo', sessao: undefined });
    if (tinha) esquecerExecucao();
  };

  return {
    estado: 'verificando',
    telaAberta: false,
    enviando: false,

    async iniciar() {
      if (get().estado === 'autenticado') return;
      const ok = await get().renovar();
      if (!ok) set({ estado: 'anonimo' });
    },

    async entrar(email, senha, tenantId) {
      if (get().enviando) return false;
      set({ enviando: true, recusa: undefined });
      const resposta = await postar('login', { email: email.trim(), password: senha, ...(tenantId ? { tenant_id: tenantId } : {}) });
      try {
        if (!resposta) { set({ recusa: lerRecusa(0, null, 0) }); return false; }
        const corpo: unknown = await resposta.json().catch(() => null);
        const sessao = resposta.ok ? lerSessao(corpo, Date.now()) : undefined;
        if (sessao) { aceitar(sessao); return true; }
        const recusa = resposta.ok ? lerRecusa(502, null, 0) : lerRecusa(resposta.status, corpo, Number(resposta.headers.get('Retry-After')) || 0);
        set({ recusa, tenants: recusa.tipo === 'escolher-tenant' ? recusa.tenants : get().tenants });
        return false;
      } finally {
        set({ enviando: false });
      }
    },

    renovar() {
      // Uma renovação por vez: vários pedidos com token vencido ao mesmo tempo — os painéis de
      // resultados disparam vários — esperam a mesma. Duas renovações concorrentes gastariam o
      // cookie duas vezes, e a rotação do serviço trataria a segunda como reuso.
      renovando ??= (async () => {
        const resposta = await postar('refresh', {});
        const sessao = resposta?.ok ? lerSessao(await resposta.json().catch(() => null), Date.now()) : undefined;
        if (sessao) { aceitar(sessao); return true; }
        // Sem resposta é rede, não recusa: a sessão atual continua até o token vencer.
        if (resposta) encerrar();
        return false;
      })().finally(() => { renovando = undefined; });
      return renovando;
    },

    async sair() {
      encerrar();
      await postar('logout', {});
    },

    abrirLogin: () => set({ telaAberta: true, recusa: undefined }),
    fecharLogin: () => set({ telaAberta: false, recusa: undefined, tenants: undefined }),
  };
});

usarCredencial({
  token: () => useAuthStore.getState().sessao?.token,
  renovar: () => useAuthStore.getState().renovar(),
});
