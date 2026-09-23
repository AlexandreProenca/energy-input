import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NGINX_ROUTES_FILE, nginxPattern, nginxRoutesMap } from '../nginxRoutes';
import { DENIED_BY_DESIGN, SIMULATION_ROUTES } from '../simulationRoutes';

/**
 * O mapa de rotas do nginx é gerado da mesma lista que o proxy de desenvolvimento usa (T027,
 * ADR-0003). Com a chave da API injetada no servidor, uma rota que o nginx deixasse passar a
 * mais seria acesso à conta do dono da chave — por isso a divergência reprova aqui.
 */
describe('o arquivo versionado', () => {
  it('é exatamente o que o gerador produz', () => {
    // Mexeu em scripts/simulationRoutes.ts? Rode `npm run nginx-routes`.
    expect(readFileSync(NGINX_ROUTES_FILE, 'utf8')).toBe(nginxRoutesMap());
  });

  it('tem uma regra por rota da lista', () => {
    expect(nginxRoutesMap().match(/^\s+"~\^/gm)).toHaveLength(SIMULATION_ROUTES.length);
  });
});

/**
 * As regras rodam no PCRE do nginx; aqui rodam no motor do JavaScript, que interpreta estas
 * construções (classes, quantificadores, lookahead) do mesmo jeito. O teste de contêiner do CI
 * confere as mesmas decisões no nginx de verdade.
 */
const regras = SIMULATION_ROUTES.map((r) => new RegExp(nginxPattern(r)));
/** Como o nginx compara: `$uri`, com o prefixo de montagem e já sem query string. */
const permite = (uri: string) => regras.some((r) => r.test(uri));
const SIM = 'sim_01M2KXB9D4TQ7F3S0YJ8N5VZQK';
const STD = 'std_01M2KXBC7E9GH4J6K8M0N2P4Q6';

describe('as regras no nginx', () => {
  it('deixam passar o que o app usa', () => {
    for (const uri of [
      '/simulation-api/v1/engines',
      '/simulation-api/v1/weather',
      '/simulation-api/v1/models',
      '/simulation-api/v1/simulations',
      `/simulation-api/v1/simulations/${SIM}`,
      `/simulation-api/v1/simulations/${SIM}/results/timeseries`,
      `/simulation-api/v1/simulations/${SIM}/artifacts/eplusout.err`,
      `/simulation-api/v1/studies/${STD}/results`,
    ]) expect(permite(uri), uri).toBe(true);
  });

  it('recusam tudo o que o proxy de desenvolvimento recusa por desenho', () => {
    for (const rota of DENIED_BY_DESIGN) expect(permite(`/simulation-api${rota}`), rota).toBe(false);
  });

  it('recusam travessia, que no nginx já chega decodificada', () => {
    // `$uri` já tem `%2f` decodificado para `/`, e a classe do nome do artefato não aceita `/`.
    expect(permite(`/simulation-api/v1/simulations/${SIM}/artifacts/../../etc/passwd`)).toBe(false);
    expect(permite(`/simulation-api/v1/simulations/${SIM}/artifacts/a/b`)).toBe(false);
    expect(permite(`/simulation-api/v1/simulations/${SIM}/artifacts/.oculto`)).toBe(false);
  });

  it('não aceitam rota sem o prefixo de montagem, nem com sobra no fim', () => {
    expect(permite('/v1/engines')).toBe(false);
    expect(permite('/simulation-api/v1/engines/extra')).toBe(false);
    expect(permite('/simulation-api/v1/enginesX')).toBe(false);
  });
});

describe('o gerador', () => {
  it('retira a query string, que não faz parte de `$uri`', () => {
    const comQuery = SIMULATION_ROUTES.find((r) => r.startsWith('/v1/weather'))!;
    expect(nginxPattern(comQuery)).toBe('^/simulation-api/v1/weather$');
  });

  it('recusa rota com aspas, que encerrariam a string no nginx', () => {
    expect(() => nginxRoutesMap(['/v1/"quebra"'])).toThrow(/aspas/);
  });
});
