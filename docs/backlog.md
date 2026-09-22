# Backlog

Quadro de tarefas. Uma tarefa = uma branch = um documento + código/testes + commit + PR,
conforme [`AGENTS.md`](../AGENTS.md) §3.

**Convenções deste quadro**

- Id `TNNN`; o documento da tarefa é `docs/tasks/TNNN-slug.md`, a branch é `task/TNNN-slug`
  e o rodapé do commit é `Refs: TNNN`.
- Estado: `[ ]` aberta · `[~]` em andamento · `[x]` concluída.
- **Não comece uma tarefa cuja dependência ainda esteja aberta sem entender por quê.**

---

## Épico E1 — Dashboards de Análise Energética e Estudos

Implementa o item 1 do roadmap ([`PRD.md`](PRD.md) §9): visualização gráfica na aplicação
das curvas de consumo anual, temperaturas operativas e horas de desconforto; e adota o
recurso **estudo** (`/v1/studies`) da API de simulação para versionar e agrupar execuções.

### Como a API entrega esses dados

Levantado no OpenAPI do serviço em 2026-09-22. O cliente local ainda não modela nada disto.

- **As séries temporais vêm em JSON, não em artefato.**
  `GET /v1/simulations/{id}/results/timeseries?variable=&key=&frequency=&from=&to=&limit=&cursor=`
  devolve a série de **uma** variável, já lida do `eplusout.sql`:
  `{ variable:{name,key,frequency,units,aggregation,is_meter}, utc_offset_hours,
  itens:[{timestamp,month,day,hour,minute,value}], proximo_cursor }`.
  `variable` é obrigatório e precisa resolver para uma única série — ambiguidade é **422**
  listando as candidatas. `limit` padrão 10 000, teto 100 000. `hour` é a hora local do
  **fim** do intervalo (1 a 24); `utc_offset_hours` liga ao `timestamp` em UTC.
  Não é preciso baixar nem parsear `.csv`/`.sql` no navegador.
- `GET …/results/variables?limit=&cursor=` lista o catálogo RDD/MDD — **tipos** de saída,
  sem prometer chaves concretas nem que a série foi efetivamente gravada.
- `GET …/results/summary` é o resultado **permanente**: `comfort` já vem **em horas** e
  sobrevive à retenção que apaga o `.sql` (depois disso a série responde **410**).
  Antes de `succeeded` responde **409**.
- `Frequencia`: `system_timestep | zone_timestep | hourly | daily | monthly | run_period |
  annual | unknown` — a grafia do contrato difere da do motor.
- **Estudo** (`POST /v1/studies` → **202** com `Location`, **sem `Idempotency-Key`**):
  agrupa N variações de uma mesma `model_version_id`, deduplica conteúdo idêntico por
  `content_hash` (`shared: true`) e expõe em `GET /v1/studies/{id}/results` uma tabela
  comparativa pronta, montada do resumo permanente. O corpo aceita `parameters`
  (produto cartesiano, ex.: `{"/Material/Isolante_EPS/thickness":[0.05,0.1,0.15]}`)
  **ou** `variations` (JSON Patch + rótulo, 1 a 200 operações), além de `tags` e
  `options.artifacts` (`results` = o `.sql` de onde saem as séries).
  `/runs` e `/results` paginam por **`from_index`**, não pelo cursor opaco das outras rotas.
  Id do estudo: `^std_[0-7][0-9A-HJKMNP-TV-Z]{25}$`.

**Bloqueio atual:** o allowlist do proxy de desenvolvimento (`scripts/simulationProxy.ts:5`)
barra todas essas rotas — `/results/timeseries`, `/results/variables` e todo `/v1/studies…`
respondem 404, e só `weather` e `models` aceitam query string.
**Em produção não há rota a liberar:** `docker/nginx.conf:40-42` usa um `location` de
prefixo com `proxy_pass`, que já repassa sub-rotas e query string — essas chamadas
funcionariam hoje na imagem Docker. O allowlist é, portanto, um controle **só de
desenvolvimento**, e produção é mais permissiva que o `npm run dev`. Essa assimetria é
anterior a este épico; ela precisa ficar escrita, não ser "corrigida" por engano.

### Decisões de rumo já tomadas

| Assunto | Escolha |
| --- | --- |
| Gráficos | SVG próprio, **sem dependência nova**; agregação pura em `src/core/`; carpete anual em `<canvas>` |
| Modo do estudo | `parametric` |
| Lugar na interface | Novo modo **Resultados**, quarto item do cabeçalho, com `lazy()` |
| Sequência | Dashboards primeiro; estudos depois, reaproveitando os mesmos gráficos |

### Quadro

| Estado | Id | Tarefa | Depende de |
| --- | --- | --- | --- |
| [ ] | T001 | Execução anual real bem-sucedida e captura de fixtures | — |
| [ ] | T002 | Liberar séries e estudos no proxy de desenvolvimento; paridade do nginx | — |
| [ ] | T003 | Tipos e métodos de série temporal no cliente da API | T001, T002 |
| [ ] | T004 | `core/results/series.ts` — agregação, reamostragem e conversão de unidades | T001 |
| [ ] | T005 | `core/results/comfort.ts` — horas de desconforto | T004 |
| [ ] | T006 | Casca do modo Resultados | T003 |
| [ ] | T007 | Componentes de gráfico SVG reutilizáveis | T004, T006 |
| [ ] | T008 | Painel de consumo anual | T007 |
| [ ] | T009 | Ligar o preset `conforto` por padrão e fechar a divergência de defaults — **ADR** | T001 |
| [ ] | T010 | Painel de temperatura operativa | T007, T009 |
| [ ] | T011 | Painel de horas de desconforto | T005, T007, T009 |
| [ ] | T012 | Tipos e métodos de estudo no cliente da API | T002 |
| [ ] | T013 | `studyStore.ts` — acompanhamento do estudo | T012 |
| [ ] | T014 | Montar cenários e criar o estudo | T013 |
| [ ] | T015 | Tabela comparativa e gráfico do estudo | T014, T007 |

---

### Fase 0 — Destravar

#### T001 · Execução anual real bem-sucedida e captura de fixtures

**Por que é a primeira.** [`DEVELOPMENT.md`](DEVELOPMENT.md) registra que, em 22/09/2026,
**nenhuma simulação jamais terminou com sucesso** no serviço: autenticação, catálogo,
upload, criação e repetição idempotente funcionaram, mas a execução terminou `failed` com
`err_available: false`. A forma real de `Summary`, a existência das séries e o download de
artefatos nunca foram observados. Desenhar gráfico contra formato adivinhado é retrabalho
garantido.

**Entra:** novo `scripts/capture-results-fixtures.ts`, irmão de
`scripts/simulation-api-check.ts`. Roda em Node, portanto aponta **direto** para
`https://homolog.ee.dev.br/v1` com o token de `.env.local` e não depende do proxy nem da
T002. Gera um modelo com `runPeriod.mode = 'annual'` e `outputs.selected` incluindo
`conforto`, escolhe um `weather_id` do catálogo, executa, aguarda o estado terminal e grava
em `src/features/simulation/__tests__/fixtures/`: `summary.json`, `variables.json`,
`artifacts.json` e três `timeseries-*.json` — temperatura operativa horária,
`Electricity:Facility` mensal e carga de resfriamento horária.
Cria também `CHANGELOG.md` e `MEMORY.md`, exigidos por AGENTS.md §3 e hoje inexistentes, e
fixa a convenção `docs/tasks/TNNN-slug.md`, corrigindo a divergência entre AGENTS.md §2/§3
(que diz `NNN`) e o template (que usa `TNNN`).

**Não entra:** qualquer interface. Nenhum gráfico nesta tarefa.

**Verificação:** fixtures commitadas; o parágrafo de `DEVELOPMENT.md` que diz que "a
validação real de resultado bem-sucedido e download permanece pendente" substituído pelo
que foi de fato observado.
**Se a execução falhar de novo, a tarefa entrega o diagnóstico e o épico para aqui.**

#### T002 · Liberar séries e estudos no proxy de desenvolvimento; paridade do nginx

**Entra:** extrair o allowlist de `scripts/simulationProxy.ts:5` para um
`scripts/simulationRoutes.ts` puro e testável — hoje o regex não tem teste nenhum — e
estendê-lo para `results/(variables|timeseries)` com query string, `simulations` com query
string (filtros de listagem) e `/v1/studies`, `/v1/studies/std_<ULID>` e
`…/(runs|results|cancel)`. Extrair também os padrões de id para `src/core/ids.ts`,
eliminando a duplicação entre `simulationStore.ts:30`, `simulationStore.ts:96` e o proxy.

**Continua negado, de propósito:** `…/iterations*` (o modo do estudo aqui é `parametric`),
`/v1/auth/*`, `/v1/api-keys*`, `/v1/webhooks*`, `/v1/usage`, `/v1/properties/*` e as rotas
de mutação de modelo (`/content`, `/patch`, `/objects`, `/materials`, `/expand`, `/upgrade`).

> **Armadilha de import.** `vite.config.ts` importa `./scripts/simulationProxy`, e o esbuild
> carrega a config **antes** de o `resolve.alias` declarado nela própria existir. Um
> `import … from '@/core/ids'` dentro do plugin **falha ao resolver**. Use caminho relativo
> (`../src/core/ids`). O arquivo já está no `include` do `tsconfig.json`, então o typecheck
> cobre.

**Também entra — nginx (`docker/nginx.conf`):** o `location /simulation-api/v1/` é prefixo e
já repassa sub-rotas e query string, então **nada precisa ser liberado em produção**. O que
falta é desempenho e robustez para páginas de série de ~1 MB:

- **`gzip_proxied any;`** — sem isso o nginx **nunca** comprime resposta vinda de proxy,
  mesmo com `application/json` já listado em `gzip_types` (linha 12). JSON de série comprime
  perto de 10:1.
- `proxy_http_version 1.1;` + `proxy_set_header Connection "";` — o padrão do nginx para
  upstream é HTTP/1.0, e o painel dispara várias consultas de série seguidas.
- Aumentar `proxy_buffer_size` / `proxy_buffers`, senão cada página vai para disco em
  `proxy_temp_path`; e subir `proxy_read_timeout` de 60 s.
- Um comentário dizendo explicitamente que **o allowlist é controle só de desenvolvimento** e
  que produção depende da autorização do próprio serviço — para ninguém "sincronizar" os dois
  apagando o allowlist depois.

Registrar também que o `error_page 302 = @simulation_download` converte **qualquer** 302 em
`{download_url}`, e conferir que nenhuma rota nova redireciona.

**Verificação:** `scripts/__tests__/simulationRoutes.test.ts` com as duas listas — aceitar
timeseries e variables com query string, `POST /v1/studies`, `…/runs?from_index=0`,
`…/cancel`; recusar `DELETE`/`PUT`, prefixo de id trocado (`/v1/studies/sim_…`),
`…/iterations`, `/v1/auth/jwks.json`, `/v1/api-keys`, fragmento `#` e travessia de caminho.
O nginx não tem portão automatizado: registrar no documento da tarefa o `curl` com
`Accept-Encoding: gzip` devolvendo `200` e `Content-Encoding: gzip`, e `nginx -t` dentro da
imagem.

### Fase 1 — Núcleo puro, sem interface

#### T003 · Tipos e métodos de série temporal no cliente da API

**Entra:** em `src/features/simulation/api.ts`, os tipos `Frequency`, `VariableCatalog`,
`TimeSeriesPoint` e `TimeSeries`, os métodos `variables(id, cursor?)` e
`timeseries(id, query)`, e um auxiliar que segue `proximo_cursor` até o fim com teto de
páginas. Mapear **410** para um estado próprio ("série expirada — o resumo continua
disponível") e **422** exibindo as candidatas devolvidas pelo serviço.

**Verificação:** `src/features/simulation/__tests__/api.test.ts` no idioma da casa
(`vi.stubGlobal('fetch', …)`), alimentado pelas fixtures da T001.

#### T004 · `core/results/series.ts` — agregação, reamostragem e conversão

**Entra:** funções puras em `src/core/results/series.ts` —
`aggregate(points, 'daily'|'monthly', 'sum'|'mean'|'min'|'max')`;
`downsample(points, targetPoints)` preservando mínimo e máximo por balde, senão a curva
anual engole os picos; `toKWh(value, units)` para J, GJ e kWh, **recusando** unidade
desconhecida em vez de adivinhar. Usar o `hour` local do contrato em vez de recalcular do
`timestamp`, e documentar que `hour` é o fim do intervalo.

`src/core/` não importa React, Zustand, Three.js nem DOM (AGENTS.md §7).

**Verificação:** `src/core/results/__tests__/series.test.ts` — 8 760 pontos, ano bissexto,
série com `value: null` e contraprova de que o downsample preserva o pico.

#### T005 · `core/results/comfort.ts` — horas de desconforto

**Armadilha que define esta tarefa.** `src/generators/hvac.ts:37-38` escreve
`heating_limit: 'NoLimit'` e `cooling_limit: 'NoLimit'` em todo
`ZoneHVAC:IdealLoadsAirSystem`. Um sistema ideal ilimitado atende o setpoint em
praticamente toda hora — portanto `Summary.comfort`
(`occupied_cooling_setpoint_not_met`, o *Comfort and Setpoint Not Met Summary* do
EnergyPlus) é **estruturalmente próximo de zero** nos modelos que este aplicativo gera.
Ele mede controle e dimensionamento, não conforto do ocupante.

Logo, **dois indicadores separados, nunca confundidos**:

- **Horas de desconforto** — calculado em `src/core/results/comfort.ts` a partir da série
  horária de `Zone Operative Temperature`. É o indicador do PRD §9 e o número principal do
  painel. Exige o preset `conforto` (T009) e `run_type: annual`.
  - Faixa `fixa` (padrão): horas com `Top` fora de `[setpoint de aquecimento, setpoint de
    resfriamento]`, tirados de `answers.hvac`. **Separar horas quentes de horas frias** — um
    agregado único esconde em qual direção o edifício falha, que é justamente o ponto.
  - Faixa `adaptativa` (ASHRAE 55 / EN 16798): centro `Tc = 0,31·T̄ext + 17,8`, banda ±3,5 K.
    `T̄ext` sai de `Site Outdoor Air Drybulb Temperature`, que o preset `conforto` já pede.
    **Fora do domínio de validade do modelo (10 °C ≤ T̄ext ≤ 33,5 °C) a função devolve nulo e
    o chamador cai na faixa fixa** — extrapolar o modelo adaptativo em silêncio é o bug que
    esta tarefa precisa testar.
- **Horas fora do setpoint** — `Summary.comfort`, sob esse rótulo honesto. É de graça,
  permanente e **sobrevive à retenção que apaga o `.sql`**: quando a série responder 410, é o
  único número que resta. Secundário, mas não descartável.

Manter a postura de `src/generators/nbr15575.ts` ("Informational only — not a compliance
check"): nada aqui emite veredito de conformidade.

**Não entra:** filtro por horas ocupadas (v1 calcula sobre as 8 760 h e rotula assim);
PMV/PPD, que exigiria temperatura radiante média, velocidade do ar, clo e met.

**Verificação:** horas quentes e frias contadas em separado, com contraprova de série
inteiramente dentro e inteiramente acima da faixa; faixa adaptativa devolvendo nulo a 5 °C e
a 40 °C; horas sem dado não contando nem como conforto nem como desconforto.

### Fase 2 — Modo Resultados e gráficos

#### T006 · Casca do modo Resultados

**Entra:** `AppMode` ganha `'results'` (`src/store/uiStore.ts:4`); entrada no `Segmented` de
`src/App.tsx:54-56`; **o ternário de `App.tsx:173-177` vira um `switch`** — hoje qualquer
modo diferente de `basic`/`geometry` cai no `ExpertShell`. Migrar snapshots antigos em
`persistence.ts:51` e `resetProject.ts:21`. Novo `src/features/results/ResultsShell.tsx`
com `lazy()` e estado vazio ("nenhuma simulação nesta sessão").

**Verificação:** portões locais; teste de `persistence` restaurando snapshot sem `mode`.

#### T007 · Componentes de gráfico SVG reutilizáveis

**Entra:** `src/features/results/charts/` com `LineChart`, `BarChart`, `StackedBarChart` e
`Carpet` — este último 365×24 em `<canvas>`, porque 8 760 `<rect>` no DOM pesam demais.
Seguir o precedente de `src/features/wizard/illustrations.tsx:285` (`viewBox`, `<title>`
como tooltip, `role="img"`, `aria-label`, paleta Tailwind do projeto). Os componentes
**recebem dados já agregados** e não calculam nada.

**Verificação:** a matemática já está coberta em `src/core/`; o componente se confere no
navegador, já que `vite.config.ts` roda o Vitest em `environment: 'node'`, sem jsdom.

#### T008 · Painel de consumo anual

**Entra:** barras mensais empilhadas por uso final, a partir dos medidores mensais do preset
`conta`, mais os totais de `Summary.end_uses`. Converter com `toKWh` — as séries vêm em J;
só as tabelas do motor usam `JtoKWH`. Em `run_type === 'design_day'`, mostrar o estado
explicativo em vez de gráfico vazio, honrando o aviso que já existe em
`SimulationDialog.tsx:122`.

**Armadilha:** com `ZoneHVAC:IdealLoadsAirSystem` a climatização **não** aparece como
`Electricity`, e sim em `DistrictHeatingWater:Facility` / `DistrictCooling:Facility` — é o
que o preset `conta` mede. O gráfico e o dicionário de rótulos precisam tratar esses
recursos como aquecimento e resfriamento, senão o painel mostra climatização zerada.

#### T009 · Ligar o preset `conforto` por padrão e fechar a divergência de defaults — **ADR**

**Armadilha:** `defaultOn` em `src/templates/outputs/outputs.json` é **dado morto**. Um
`grep` por `defaultOn` só encontra o próprio JSON e `src/templates/outputs/types.ts:8` —
nada lê o campo. O conjunto padrão real é a lista literal em `src/generators/answers.ts:100`:
`outputs: { selected: ['resumo', 'cargas', 'conta'] }`. As duas fontes coincidem hoje por
acaso. **Quem tentar "ligar o conforto" editando só o JSON não muda nada.**

**Entra:** `answers.ts` passa a derivar o padrão —
`outputs: { selected: templates.outputs.filter(p => p.defaultOn).map(p => p.id) }` — e o
`conforto` vira `defaultOn: true`. Isso liga ~4 `Output:Variable` horários; para um modelo
de 4 zonas são ~140 mil linhas a mais no `.sql`, desprezível.

**Por que exige ADR:** é mudança de comportamento em **todo arquivo gerado**, e mexe nos
hashes de propriedade do `planWizardSync` — alguém plausivelmente decidiria manter o preset
opcional e detectar a ausência na interface.

**Verificação:** teste em `src/generators/__tests__/` de que as saídas padrão incluem o
preset de conforto **e** de que derivam de `defaultOn`, sem lista duplicada — esta segunda
asserção é a trava de regressão da divergência. Reexecutar
`src/core/sync/__tests__/wizardSync.test.ts`.

#### T010 · Painel de temperatura operativa

**Entra:** curva anual com banda diária de mínimo e máximo, e carpete 365×24 por zona, com
o seletor de zona alimentado por `/results/variables`. Estado explicativo quando a
simulação não pediu o preset `conforto` (projetos anteriores à T009) ou quando a série
expirou (410).

#### T011 · Painel de horas de desconforto

**Entra:** indicadores de `Summary.comfort` com o `StatTile` já existente, mais o cálculo
indicativo da T005 quando a série existir. Inclui o dicionário pt-BR de `comfort` e
`end_uses` — hoje são **7 entradas** em `SimulationDialog.tsx:10` e todo o resto aparece em
inglês cru.

### Fase 3 — Estudos

#### T012 · Tipos e métodos de estudo no cliente da API

**Entra:** `Study`, `StudyRun`, `StudyResultsTable` e `StudyRequest`, mais os métodos
`createStudy`, `study`, `studyRuns`, `studyResults`, `cancelStudy` e `studies`. Cuidar das
duas divergências do contrato: **202 sem `Idempotency-Key`** e paginação por **`from_index`**.

#### T013 · `studyStore.ts` — acompanhamento do estudo

**Entra:** store separado. O `simulationStore` atual é de **uma** simulação e reescrevê-lo
arrastaria o fluxo existente. Polling usando `eta_seconds` e `Retry-After` — este último
hoje é lido em `api.ts:50` e **nunca usado**. Persistir apenas `{ studyId }` em
`sessionStorage`, preservando a invariante testada de que o token nunca vai para storage
(`simulationStore.test.ts:33`).

#### T014 · Montar cenários e criar o estudo

**Entra (MVP):** `parameters`. O usuário escolhe um campo do documento — espessura de
material, vidro, orientação — e uma lista de valores; a API faz o produto cartesiano e
devolve os rótulos prontos em `itens[].parameters`. Isso dispensa construir JSON Patch no
cliente. `options.artifacts` precisa incluir `results` se as séries das variações forem
consultadas depois.

**Não entra (extensão futura):** `variations` com JSON Patch arbitrário, gerado comparando o
documento base com a variante produzida por `src/generators/compose.ts`.
`diffDocuments` (`src/core/epjson/document.ts:197`) acha os objetos alterados, mas devolve
`{added, removed, changed}` por objeto e **não** RFC 6902 — a conversão para operações seria
código novo e puro.

> **Armadilha do ponteiro JSON.** Se esta tarefa (ou a extensão acima) construir caminhos,
> o escape da RFC 6901 é **`~` → `~0` antes de `/` → `~1`**, nessa ordem. Inverter produz um
> caminho *silenciosamente errado*, não um erro — o patch acerta o objeto errado. Os nomes
> aqui são em pt-BR, com espaço e acento (`'Termostato de duplo setpoint'`), e nome de objeto
> EnergyPlus pode conter `/`. O teste precisa da contraprova: `'a~b/c'` → `'a~0b~1c'`, e a
> ordem ingênua produz `'a~01b'`.

#### T015 · Tabela comparativa e gráfico do estudo

**Entra:** consumir `GET /v1/studies/{id}/results` direto — colunas e linhas já vêm prontas
—, marcando `shared: true` (variação que não gerou trabalho) e variações sem resumo. Barras
comparativas por coluna escolhida, reutilizando a T007.

---

## Documentação obrigatória do épico

Conforme AGENTS.md §4:

- **ADR-0001 — Séries temporais pela API, não por download de artefato.** Estende o PRD §4.5,
  que só prevê summary, errors, logs e artifacts; alguém plausivelmente decidiria baixar e
  parsear o `.csv`.
- **ADR-0002 — Estudo paramétrico como unidade de agrupamento e versionamento.** O conceito
  não existe no PRD.
- **ADR-0003 — Ligar o preset `conforto` por padrão** (T009): muda o arquivo gerado por todo
  projeto e mexe nos hashes do `planWizardSync`.
- **Sem ADR para os gráficos:** a decisão foi *não* adicionar dependência, e o SVG próprio já
  é o padrão da casa (`illustrations.tsx`).
- `docs/PRD.md`: **§4 enumera exatamente três MODOs** — a T006 entrega um quarto e precisa
  atualizar a seção; deixá-la em três enquanto o modo existe é justamente o apodrecimento de
  documentação que o AGENTS.md §2 existe para evitar. Também §4.5 (que descreve só
  `/simulations`) e §9 (o item de roadmap concluído).
- `docs/DEVELOPMENT.md` ganha `### Dashboards de resultados` e `### Estudos` logo após
  `### Simulação pela API de homologação`. Registrar ali as armadilhas de grafia de
  frequência (contrato `zone_timestep`/`run_period` × motor `TimeStep`/`RunPeriod` — quem
  filtrar pela grafia do motor recebe vazio em silêncio), a convenção `hour ∈ 1..24` como
  fim do intervalo, a fronteira do 410 e a assimetria allowlist dev × nginx produção.

## Perguntas em aberto

- **A execução anual vai concluir?** Nunca concluiu. A T001 é o teste.
- **Quais chaves de zona o `Zone Operative Temperature` produz**, e se `key_value: "*"` no
  epJSON vira uma série por zona no `.sql`. Resolve-se lendo as fixtures da T001.
- **Nomes reais em `Summary.comfort`.** O único exemplo do contrato é
  `occupied_cooling_setpoint_not_met`; o dicionário pt-BR da T011 depende do conjunto
  observado.
- **Retenção do `.sql`.** O contrato diz que a série vira 410 depois de um prazo que ele não
  numera. Afeta se vale guardar as séries localmente.
