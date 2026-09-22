import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { isAllowedSimulationRoute } from './simulationRoutes';

const UPSTREAM = 'https://homolog.ee.dev.br';
/** Same-origin transport; the optional server credential is restricted to loopback development. */
export function simulationProxy(): Plugin {
  const install: NonNullable<Plugin['configureServer']> = server => {
    server.middlewares.use('/simulation-api', async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const fail = (status: number, detail: string) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ detail })); };
      if (!isAllowedSimulationRoute(req.method, req.url)) return fail(404, 'Rota de simulação não disponível.');
      const origin = req.headers.origin;
      try {
        if (origin && new URL(origin).host !== req.headers.host) return fail(403, 'Origem não permitida.');
        let auth = req.headers.authorization;
        const host = (req.headers.host ?? '').split(':')[0];
        const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        if (!auth && loopback && ['localhost', '127.0.0.1'].includes(host)) {
          const token = loadEnv(server.config.mode, process.cwd(), 'SIMULATION_').SIMULATION_API_TOKEN ?? process.env.SIMULATION_API_TOKEN;
          if (token) auth = `Bearer ${token.trim().replace(/^Bearer\s+/i, '')}`;
        }
        const headers = new Headers();
        if (auth) headers.set('Authorization', auth);
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
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch { fail(502, 'Não foi possível conectar ao serviço de simulação.'); }
    });
  };
  return { name: 'simulation-api', configureServer: install };
}
