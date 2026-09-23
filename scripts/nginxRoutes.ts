/**
 * Gera o mapa de rotas permitidas do nginx a partir de `scripts/simulationRoutes.ts`.
 *
 * Uma fonte só para os dois proxies (T027, ADR-0003): o do `npm run dev` usa a lista direto; o
 * nginx de produção recebe este mapa, versionado em `docker/simulation-routes.conf`. O teste
 * `scripts/__tests__/nginxRoutes.test.ts` reprova se o arquivo versionado divergir do que este
 * gerador produz — mexer na lista sem regenerar não passa.
 *
 *   npm run nginx-routes
 *
 * O import é relativo pelo mesmo motivo de `simulationRoutes.ts`.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QUERY_SUFFIX, SIMULATION_ROUTES } from './simulationRoutes';

/** Prefixo em que o nginx monta o proxy (`location /simulation-api/v1/`). */
const MONTAGEM = '/simulation-api';

export const NGINX_ROUTES_FILE = 'docker/simulation-routes.conf';

/**
 * A expressão de uma rota como o nginx a compara.
 *
 * O nginx testa `$uri`, que **não tem query string** e já vem decodificado e normalizado —
 * `%2f` virou `/` e `..` foi resolvido antes da comparação. Por isso o sufixo de query sai, e
 * a travessia de caminho, que no proxy de desenvolvimento exige cuidado com `%2f`, aqui cai
 * sozinha: um nome de artefato com `/` não casa com a classe de caracteres permitida.
 */
export function nginxPattern(route: string): string {
  const semQuery = route.endsWith(QUERY_SUFFIX) ? route.slice(0, -QUERY_SUFFIX.length) : route;
  return `^${MONTAGEM}${semQuery}$`;
}

export function nginxRoutesMap(routes: readonly string[] = SIMULATION_ROUTES): string {
  const linhas = routes.map((r) => {
    const padrao = nginxPattern(r);
    // Aspas duplas encerrariam a string no nginx. Nenhuma rota as tem; a guarda existe para
    // que uma rota futura não gere configuração silenciosamente errada.
    if (padrao.includes('"')) throw new Error(`rota com aspas não pode ir para o nginx: ${r}`);
    return `    "~${padrao}" 1;`;
  });
  return [
    '# GERADO por scripts/nginxRoutes.ts a partir de scripts/simulationRoutes.ts — não edite à mão.',
    '# Regenere com `npm run nginx-routes`; o teste scripts/__tests__/nginxRoutes.test.ts',
    '# reprova se este arquivo divergir da lista.',
    'map $uri $rota_de_simulacao_permitida {',
    '    default 0;',
    ...linhas,
    '}',
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(NGINX_ROUTES_FILE, nginxRoutesMap());
  console.log(`escrito ${NGINX_ROUTES_FILE}`);
}
