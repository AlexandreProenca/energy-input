/**
 * O contrato da sessão com o serviço de simulação (T032, ADR-0004), sem rede e sem estado.
 *
 * O serviço troca e-mail e senha por um token de acesso curto (15 min) e grava um refresh token
 * em cookie HttpOnly, que o JavaScript não lê. O contrato está em
 * AlexandreProenca/eng-energy-plus#146; aqui ficam as decisões que dependem dele e que precisam
 * de teste: ler a resposta, classificar a recusa e decidir quando renovar.
 */

export interface UsuarioDaSessao { id: string; nome: string; email: string; papel: string }
export interface TenantDaSessao { id: string; nome: string }

export interface Sessao {
  token: string;
  /** Instante (ms desde a época) em que o token deixa de valer. */
  expiraEm: number;
  escopos: string[];
  usuario: UsuarioDaSessao;
  tenant: TenantDaSessao;
}

const texto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Lê a resposta 200 de `/auth/login` ou `/auth/refresh`. Devolve `undefined` se faltar algo:
 * uma sessão pela metade — sem tenant, por exemplo — faria a interface mostrar dados de quem não
 * se sabe quem é.
 */
export function lerSessao(corpo: unknown, agora: number): Sessao | undefined {
  const c = corpo as Record<string, unknown> | null;
  const usuario = c?.usuario as Record<string, unknown> | undefined;
  const tenant = c?.tenant as Record<string, unknown> | undefined;
  const validade = Number(c?.expires_in);
  if (!c || !texto(c.access_token) || !Number.isFinite(validade) || validade <= 0) return undefined;
  if (!usuario || !texto(usuario.id) || !texto(usuario.email) || !tenant || !texto(tenant.id)) return undefined;
  return {
    token: c.access_token,
    expiraEm: agora + validade * 1000,
    escopos: typeof c.scope === 'string' ? c.scope.split(' ').filter(Boolean) : [],
    usuario: { id: usuario.id, email: usuario.email, nome: texto(usuario.nome) ? usuario.nome : usuario.email, papel: texto(usuario.papel) ? usuario.papel : '' },
    tenant: { id: tenant.id, nome: texto(tenant.nome) ? tenant.nome : tenant.id },
  };
}

export type Recusa =
  | { tipo: 'credenciais'; mensagem: string }
  | { tipo: 'escolher-tenant'; mensagem: string; tenants: TenantDaSessao[] }
  | { tipo: 'muitas-tentativas'; mensagem: string; esperarSegundos: number }
  | { tipo: 'indisponivel'; mensagem: string };

/**
 * Por que o login não passou, na linguagem de quem digitou.
 *
 * O 401 do serviço é uma recusa só, de propósito: e-mail inexistente, senha errada, usuário ou
 * organização desativados. A mensagem não tenta adivinhar qual foi — dizer "e-mail não
 * encontrado" contaria a um atacante quais e-mails existem.
 */
export function lerRecusa(status: number, corpo: unknown, retryAfter: number): Recusa {
  const c = corpo as Record<string, unknown> | null;
  if (status === 401) return { tipo: 'credenciais', mensagem: 'E-mail ou senha incorretos.' };
  if (status === 409) {
    const tenants = (Array.isArray(c?.tenants) ? c.tenants : [])
      .map((t) => t as Record<string, unknown>)
      .filter((t) => texto(t.id))
      .map((t) => ({ id: t.id as string, nome: texto(t.nome) ? t.nome : (t.id as string) }));
    if (tenants.length > 1) return { tipo: 'escolher-tenant', mensagem: 'Sua conta está em mais de uma organização. Escolha em qual entrar.', tenants };
  }
  if (status === 429) {
    const segundos = retryAfter > 0 ? retryAfter : 60;
    return { tipo: 'muitas-tentativas', mensagem: `Muitas tentativas. Tente de novo em ${segundos < 120 ? `${segundos} s` : `${Math.ceil(segundos / 60)} min`}.`, esperarSegundos: segundos };
  }
  if (status === 404) return { tipo: 'indisponivel', mensagem: 'O serviço de simulação ainda não oferece login com e-mail e senha.' };
  return { tipo: 'indisponivel', mensagem: `Não foi possível entrar agora (HTTP ${status || 'sem resposta'}). Tente de novo em instantes.` };
}

/**
 * Quantos milissegundos esperar antes de renovar: um minuto antes de expirar. Token com menos de
 * dois minutos renova na metade do que resta, para não renovar em seguida e em laço. O piso de
 * 5 s protege de relógio adiantado, em que o token já chegaria "vencido".
 */
export function quandoRenovar(sessao: Pick<Sessao, 'expiraEm'>, agora: number): number {
  const resta = sessao.expiraEm - agora;
  const alvo = resta >= 120_000 ? resta - 60_000 : resta / 2;
  return Math.max(5_000, alvo);
}
