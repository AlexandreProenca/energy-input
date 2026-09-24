/**
 * O cookie de sessão atravessando o proxy (T032, ADR-0004).
 *
 * O serviço grava o refresh token com `Path=/v1/auth`, que é o caminho **dele**. O navegador vê
 * o proxy, em `/simulation-api/v1/auth`: sem reescrever, o cookie nunca voltaria nas renovações.
 * O `Domain`, se vier, sai — o cookie pertence à origem do aplicativo, não ao host do serviço.
 *
 * O nginx faz o mesmo com `proxy_cookie_path`; este módulo é o do proxy de desenvolvimento, e
 * fica fora do plugin para ter teste.
 */
export const CAMINHO_NO_SERVICO = '/v1/auth';
export const CAMINHO_NO_PROXY = '/simulation-api/v1/auth';

/** Só as rotas de sessão levam e trazem cookie. As outras nunca veem o refresh token. */
export const rotaDeSessao = (url: string | undefined): boolean => /^\/v1\/auth\/(?:login|refresh|logout)(?:\?|$)/.test(url ?? '');

export function reescreverCookie(setCookie: string): string {
  return setCookie
    .split(';')
    .map((parte) => parte.trim())
    .filter((parte) => !/^domain=/i.test(parte))
    .map((parte) => (/^path=/i.test(parte) && parte.slice(5).startsWith(CAMINHO_NO_SERVICO) ? `Path=${CAMINHO_NO_PROXY}${parte.slice(5 + CAMINHO_NO_SERVICO.length)}` : parte))
    .join('; ');
}

/**
 * Separa um `Set-Cookie` que chegou com vários cookies juntos por vírgula — o que
 * `headers.get('set-cookie')` devolve em runtime sem `getSetCookie`. A vírgula de `Expires=Thu,
 * 01 Jan …` não separa nada: só separa a vírgula seguida de um novo `nome=`.
 */
export function separarSetCookie(junto: string): string[] {
  return junto.split(/,(?=\s*[^;,=\s]+=)/).map((c) => c.trim()).filter(Boolean);
}

/**
 * As rotas de sessão exigem `Origin`. O navegador sempre o manda em POST, inclusive de mesma
 * origem; pedido sem ele numa rota que recebe o cookie de renovação não veio desta página. É
 * defesa somada ao `SameSite=Strict` e ao `Content-Type: application/json` do serviço.
 */
export const origemExigida = (url: string | undefined, origin: string | undefined): boolean => rotaDeSessao(url) && !origin;
