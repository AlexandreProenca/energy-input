import type { Plugin } from 'vite';
import { isAllowedSimulationRoute } from './simulationRoutes';
import { origemExigida, reescreverCookie, rotaDeSessao, separarSetCookie } from './cookieDeSessao';

const UPSTREAM = 'https://homolog.ee.dev.br';
/**
 * Transporte de mesma origem para o serviço de simulação.
 *
 * Desde a T032 (ADR-0004) o proxy **não tem credencial própria**: repassa o `Authorization` do
 * navegador — o token da pessoa que entrou — e, só nas rotas de sessão, o cookie do refresh
 * token. As recusas continuam: rota fora da lista, método fora de GET/POST e outra origem.
 */
export function simulationProxy(): Plugin {
  const install: NonNullable<Plugin['configureServer']> = server => {
    server.middlewares.use('/simulation-api', async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const fail = (status: number, detail: string) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ detail })); };
      if (!isAllowedSimulationRoute(req.method, req.url)) return fail(404, 'Rota de simulação não disponível.');
      const origin = req.headers.origin;
      try {
        if (origin && new URL(origin).host !== req.headers.host) return fail(403, 'Origem não permitida.');
        if (origemExigida(req.url, origin)) return fail(403, 'Origem não informada.');
        const sessao = rotaDeSessao(req.url);
        // Headers novos, e não os do navegador: o serviço confere `Origin`/`Referer` contra o
        // próprio `Host` em `refresh` e `logout`, e os do aplicativo dariam 403 (eng-energy-plus
        // T069). A origem já foi conferida acima, contra o host do aplicativo.
        const headers = new Headers();
        if (req.headers.authorization) headers.set('Authorization', req.headers.authorization);
        if (sessao && req.headers.cookie) headers.set('Cookie', req.headers.cookie);
        for (const name of ['content-type', 'idempotency-key']) if (req.headers[name]) headers.set(name, String(req.headers[name]));
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 50 * 1024 * 1024) return fail(413, 'Arquivo acima de 50 MB.'); chunks.push(Buffer.from(chunk)); }
        const response = await fetch(`${UPSTREAM}${req.url}`, { method: req.method, headers,
          body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: 'manual', signal: AbortSignal.timeout(55_000) });
        if (response.status === 302 && req.url.includes('/artifacts/')) {
          const location = response.headers.get('Location');
          if (!location || new URL(location).protocol !== 'https:') return fail(502, 'Link de download inválido.');
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ download_url: location })); return;
        }
        res.statusCode = response.status;
        for (const name of ['content-type', 'retry-after', 'x-cache', 'idempotency-replayed']) {
          const value = response.headers.get(name); if (value) res.setHeader(name, value);
        }
        if (sessao) {
          // `getSetCookie` separa os cabeçalhos certo; `get('set-cookie')` os junta por vírgula,
          // o que quebra no `Expires=…, 23 Sep …`. O fallback é para Node sem o método.
          const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : separarSetCookie(response.headers.get('set-cookie') ?? '');
          if (cookies.length) res.setHeader('Set-Cookie', cookies.map(reescreverCookie));
        }
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch { fail(502, 'Não foi possível conectar ao serviço de simulação.'); }
    });
  };
  return { name: 'simulation-api', configureServer: install };
}
