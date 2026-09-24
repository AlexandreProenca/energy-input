/**
 * Allowlist do proxy de desenvolvimento.
 *
 * Fica fora do plugin do Vite para poder ser testado: é um controle de segurança, e um
 * controle de segurança sem teste é uma suposição. Ele decide quais rotas do serviço de
 * simulação o `npm run dev` repassa — **e apenas o `npm run dev`**.
 *
 * **Vale também para o nginx de produção** desde a T027: o mapa do nginx
 * (`docker/simulation-routes.conf`) é **gerado** desta lista por `scripts/nginxRoutes.ts`, e um
 * teste reprova se os dois divergirem. Desde a T032 (ADR-0004) a credencial é de novo a de cada
 * navegador — o token da pessoa que entrou —, mas a lista continua: é a superfície do serviço que
 * este aplicativo usa, e nada além dela precisa passar.
 *
 * O import aqui é relativo de propósito: `vite.config.ts` carrega este módulo através de
 * `simulationProxy.ts`, e o esbuild resolve a config **antes** de existir o `resolve.alias`
 * que ela mesma declara. `@/core/ids` falharia ao resolver.
 */
import { ULID } from '../src/core/ids';

const SIM = `sim_${ULID}`;
const STD = `std_${ULID}`;
/** O sufixo de query string das rotas; o gerador do nginx o reconhece e o retira. */
export const QUERY_SUFFIX = '(?:\\?[^#]*)?';

/**
 * Query string opcional. O `#` literal é recusado porque um pedido legítimo nunca o envia:
 * o fragmento fica no navegador. Já `%23` é aceito, porque é como se manda um `#` como
 * dado — nome de variável pode contê-lo.
 *
 * O **conteúdo** da query não é validado aqui, e isso é decisão, não esquecimento: este
 * allowlist controla QUAIS ROTAS o proxy repassa, não a semântica dos parâmetros, que
 * pertence ao serviço. Um `?path=../../etc/passwd` passa e é repassado — não é travessia,
 * porque não toca o caminho da URL, e o serviço valida os próprios parâmetros. Endurecer
 * aqui significaria duplicar o contrato do upstream e quebrar a cada campo novo que ele
 * aceitar.
 */
const Q = QUERY_SUFFIX;

/**
 * Cada entrada é uma rota completa, ancorada nas duas pontas. Ampliar esta lista é ampliar
 * a superfície do proxy — dos dois proxies, desde a T027 — veja em `DENIED_BY_DESIGN` o que ficou de fora e por quê.
 */
export const SIMULATION_ROUTES = [
  // Sessão da pessoa (T032, ADR-0004): e-mail e senha trocados por token, renovação e saída.
  // O refresh token vai em cookie HttpOnly, e só estas três rotas o recebem.
  `/v1/auth/login`,
  `/v1/auth/refresh`,
  `/v1/auth/logout`,

  // Catálogos.
  `/v1/engines`,
  `/v1/weather${Q}`,
  `/v1/models${Q}`,

  // Simulações: criação, listagem com filtros, ciclo de vida.
  `/v1/simulations${Q}`,
  `/v1/simulations/${SIM}`,
  `/v1/simulations/${SIM}/cancel`,
  `/v1/simulations/${SIM}/logs`,
  `/v1/simulations/${SIM}/artifacts`,
  // Nome de artefato, restrito ao que o motor realmente produz (`eplusout.err`,
  // `eplustbl.csv`, `sqlite.err` — os 19 nomes conferidos nas fixtures da T001).
  // Três restrições, cada uma cobrindo um caso:
  //   1. A classe exclui `%`, e com isso a barra codificada. O padrão anterior,
  //      `[^/?#]+`, barrava `/` literal mas deixava passar `..%2f`, e o proxy repassa a
  //      URL crua, sem decodificar.
  //   2. A inicial alfanumérica recusa nome começando por ponto — `..` e `.oculto`.
  //   3. O lookahead recusa `..` em qualquer outra posição, como `a..b`. Este terceiro
  //      NÃO corrige falha: `a..b` é nome de arquivo comum, e travessia só existe quando
  //      `..` é o segmento inteiro, já coberto por (2). É defesa em profundidade, de
  //      graça, que dispensa raciocinar sobre como o upstream normaliza o caminho.
  `/v1/simulations/${SIM}/artifacts/(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._-]*`,

  // Resultados. `summary` e `errors` já existiam; `variables` e `timeseries` são o que o
  // épico de dashboards consome, e ambos precisam de query string.
  `/v1/simulations/${SIM}/results/summary`,
  `/v1/simulations/${SIM}/results/errors`,
  `/v1/simulations/${SIM}/results/variables${Q}`,
  `/v1/simulations/${SIM}/results/timeseries${Q}`,

  // Estudos, no modo `parametric`.
  `/v1/studies${Q}`,
  `/v1/studies/${STD}`,
  `/v1/studies/${STD}/cancel`,
  `/v1/studies/${STD}/runs${Q}`,
  `/v1/studies/${STD}/results${Q}`,
];

/**
 * Negado de propósito. Está aqui como documentação executável: o teste percorre esta lista
 * e falha se alguma dessas rotas passar a ser aceita por descuido ao mexer em `ROUTES`.
 *
 * - `…/studies/*​/iterations*`: o modo de estudo adotado é `parametric` (backlog E1). O modo
 *   iterativo edita materiais pela API, o que criaria uma segunda fonte da verdade ao lado
 *   do documento em memória.
 * - `/v1/auth/token`, `/v1/auth/jwks.json` e `/v1/api-keys*`: o navegador entra com e-mail e
 *   senha (`/v1/auth/login`). Trocar ou gerir chave de API é coisa de integração, não desta
 *   interface (ADR-0004).
 * - `/v1/webhooks*`: configuração persistente no serviço, sem interface que a gerencie.
 * - `/v1/usage`: exige escopo `admin:billing`.
 * - `/v1/properties/*`: psicrometria e fluidos, fora do escopo do produto.
 * - Mutação de modelo (`/content`, `/patch`, `/objects`, `/materials`, `/expand`,
 *   `/upgrade`): o documento é editado localmente; deixar o serviço reescrevê-lo abriria a
 *   porta para sobrescrever edição do usuário sem passar pelo `planWizardSync`.
 */
export const DENIED_BY_DESIGN = [
  '/v1/auth/token',
  '/v1/auth/jwks.json',
  '/v1/api-keys',
  '/v1/webhooks',
  '/v1/usage',
  '/v1/properties/psychrometrics/density',
  '/v1/models/mdl_01M2KXAZ9WQK8YT4N6P0R2S5V7/content',
  '/v1/models/mdl_01M2KXAZ9WQK8YT4N6P0R2S5V7/patch',
  '/v1/models/mdl_01M2KXAZ9WQK8YT4N6P0R2S5V7/materials/edit',
  '/v1/models/-/upgrade-chain',
  '/v1/studies/std_01M2KXBC7E9GH4J6K8M0N2P4Q6/iterations',
];

const ALLOWED = new RegExp(`^(?:${SIMULATION_ROUTES.join('|')})$`);

/** Só GET e POST: o serviço não expõe mutação por outros verbos nas rotas aceitas. */
export const SIMULATION_METHODS = ['GET', 'POST'];

/**
 * `url` é o caminho já sem o prefixo de montagem `/simulation-api`, como o middleware do
 * Vite o entrega — portanto começa em `/v1`.
 *
 * Devolve um type predicate sobre `url` para que o chamador não precise repetir a checagem
 * de `undefined` depois de já ter passado por aqui.
 */
export function isAllowedSimulationRoute(method: string | undefined, url: string | undefined): url is string {
  if (!url || !method || !SIMULATION_METHODS.includes(method)) return false;
  return ALLOWED.test(url);
}
