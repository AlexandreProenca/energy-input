import { describe, expect, it } from 'vitest';
import { DENIED_BY_DESIGN, isAllowedSimulationRoute } from '../simulationRoutes';

const SIM = 'sim_01M2KXB9D4TQ7F3S0YJ8N5VZQK';
const STD = 'std_01M2KXBC7E9GH4J6K8M0N2P4Q6';

const permite = (url: string, metodo = 'GET') => isAllowedSimulationRoute(metodo, url);

describe('rotas permitidas pelo proxy de desenvolvimento', () => {
  it.each([
    ['/v1/engines'],
    ['/v1/weather?city=Florianopolis&limit=50'],
    ['/v1/simulations'],
    ['/v1/simulations?status=succeeded&status=failed&tag=projeto%3Atorre-norte'],
    [`/v1/simulations/${SIM}`],
    [`/v1/simulations/${SIM}/logs`],
    [`/v1/simulations/${SIM}/artifacts`],
    [`/v1/simulations/${SIM}/artifacts/eplusout.err`],
    [`/v1/simulations/${SIM}/results/summary`],
    [`/v1/simulations/${SIM}/results/errors`],
  ])('aceita %s', (url) => expect(permite(url)).toBe(true));

  it('aceita as rotas de série que o épico de dashboards consome, com query string', () => {
    // Antes da T002 estas duas davam 404 no `npm run dev`: só `weather` e `models` podiam
    // levar query string, e nada sob `results/` além de summary e errors passava.
    expect(permite(`/v1/simulations/${SIM}/results/variables?limit=200&cursor=abc`)).toBe(true);
    expect(
      permite(
        `/v1/simulations/${SIM}/results/timeseries?variable=Zone+Operative+Temperature&key=ZONE+ONE&frequency=hourly&limit=10000`,
      ),
    ).toBe(true);
  });

  it('aceita os estudos paramétricos, inclusive a paginação por índice', () => {
    expect(permite('/v1/studies?model_id=mdl_01M2KXAZ9WQK8YT4N6P0R2S5V7&limit=50')).toBe(true);
    expect(permite('/v1/studies', 'POST')).toBe(true);
    expect(permite(`/v1/studies/${STD}`)).toBe(true);
    expect(permite(`/v1/studies/${STD}/cancel`, 'POST')).toBe(true);
    expect(permite(`/v1/studies/${STD}/runs?from_index=0&limit=50`)).toBe(true);
    expect(permite(`/v1/studies/${STD}/results?from_index=50`)).toBe(true);
  });
});

describe('rotas recusadas pelo proxy de desenvolvimento', () => {
  it.each(DENIED_BY_DESIGN)('recusa %s, negada por decisão registrada', (url) => {
    // `DENIED_BY_DESIGN` é documentação executável: ampliar `ROUTES` sem pensar quebra aqui.
    expect(permite(url)).toBe(false);
    expect(permite(url, 'POST')).toBe(false);
  });

  it('recusa método fora de GET e POST', () => {
    for (const metodo of ['DELETE', 'PUT', 'PATCH', 'HEAD', 'OPTIONS', '']) {
      expect(permite(`/v1/simulations/${SIM}`, metodo)).toBe(false);
    }
    expect(isAllowedSimulationRoute(undefined, `/v1/simulations/${SIM}`)).toBe(false);
    expect(isAllowedSimulationRoute('GET', undefined)).toBe(false);
  });

  it('recusa prefixo de identificador trocado', () => {
    // Um estudo não é uma simulação: aceitar o id errado mandaria a consulta para uma rota
    // que o serviço responderia com 404 — ou, pior, para o recurso de outra pessoa.
    expect(permite(`/v1/simulations/${STD}`)).toBe(false);
    expect(permite(`/v1/studies/${SIM}`)).toBe(false);
  });

  it('recusa ULID malformado', () => {
    expect(permite('/v1/simulations/sim_91M2KXB9D4TQ7F3S0YJ8N5VZQK')).toBe(false); // começa em 9
    expect(permite('/v1/simulations/sim_01M2KXB9D4TQ7F3S0YJ8N5VZQ')).toBe(false); // 25 caracteres
    expect(permite('/v1/simulations/sim_01M2KXB9D4TQ7F3S0YJ8N5VZQKK')).toBe(false); // 27
    expect(permite('/v1/simulations/sim_01m2kxb9d4tq7f3s0yj8n5vzqk')).toBe(false); // minúsculas
    expect(permite('/v1/simulations/sim_01I2KXB9D4TQ7F3S0YJ8N5VZQK')).toBe(false); // `I` fora do alfabeto
  });

  it('recusa travessia de caminho, inclusive codificada no nome do artefato', () => {
    expect(permite('/v1/../../etc/passwd')).toBe(false);
    expect(permite(`/v1/simulations/${SIM}/artifacts/../../../etc/passwd`)).toBe(false);
    expect(permite(`/v1/simulations/${SIM}/artifacts/`)).toBe(false);
    // A barra codificada é o caso que o padrão antigo (`[^/?#]+`) deixava passar: ele
    // barrava `/` literal, mas `%2f` não contém `/`, e o proxy repassa a URL crua.
    expect(permite(`/v1/simulations/${SIM}/artifacts/..%2f..%2fetc%2fpasswd`)).toBe(false);
    expect(permite(`/v1/simulations/${SIM}/artifacts/..`)).toBe(false);
    expect(permite(`/v1/simulations/${SIM}/artifacts/.hidden`)).toBe(false);
  });

  it('continua aceitando todo nome de artefato que o motor realmente produz', () => {
    // Conferidos contra a fixture real de artefatos capturada na T001.
    for (const nome of ['eplusout.err', 'eplusout.sql', 'eplustbl.csv', 'eplustbl.htm', 'sqlite.err']) {
      expect(permite(`/v1/simulations/${SIM}/artifacts/${nome}`)).toBe(true);
    }
  });

  it('recusa fragmento e query onde a rota não a prevê', () => {
    // O fragmento nunca chega ao servidor num pedido legítimo; se apareceu, foi forjado.
    expect(permite(`/v1/simulations/${SIM}/results/timeseries?variable=X#frag`)).toBe(false);
    expect(permite('/v1/engines?x=1')).toBe(false);
    expect(permite(`/v1/simulations/${SIM}/logs?x=1`)).toBe(false);
  });

  it('recusa rota desconhecida e sufixo colado numa rota válida', () => {
    expect(permite('/v1/')).toBe(false);
    expect(permite('/v1/enginesX')).toBe(false);
    expect(permite('/v2/engines')).toBe(false);
    expect(permite(`/v1/simulations/${SIM}/results`)).toBe(false);
    expect(permite(`/v1/simulations/${SIM}/results/timeseriesX`)).toBe(false);
  });
});
