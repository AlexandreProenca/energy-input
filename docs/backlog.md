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
| [x] | T001 | Execução anual real bem-sucedida e captura de fixtures | — |
| [x] | T002 | Liberar séries e estudos no proxy de desenvolvimento; paridade do nginx | — |
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
| [ ] | T016 | Destravar a execução de simulações no serviço | — |
| [ ] | T017 | CI: o teste de contêiner não exercita o proxy de simulação | T002 |

---

### Fase 0 — Destravar

#### T001 · Execução anual real bem-sucedida e captura de fixtures — **concluída**

Entregue em [`docs/tasks/T001-execucao-real-e-fixtures.md`](tasks/T001-execucao-real-e-fixtures.md).

**Resultado:** nenhuma execução **nova** conclui no serviço desde 19/09/2026 — mas as três
execuções bem-sucedidas de 16/09 continuam com resultados e artefatos não expirados, e foi
delas que saíram as fixtures. O épico segue destravado; a falha de execução virou a **T016**.

`scripts/capture-results-fixtures.ts` grava em `src/core/results/__fixtures__/`, em dois
modos (`SIMULATION_ID=sim_…` para capturar de uma execução concluída, ou sem variável para
executar uma anual nova). `src/core/results/__tests__/fixtures.test.ts` trava o contrato
observado em 12 asserções.

**O que as fixtures ensinaram, e que muda as tarefas abaixo:**

- `hour` vai de **1 a 24** e é o **fim** do intervalo: a hora 24 ainda é do dia anterior,
  embora o `timestamp` UTC já esteja no dia seguinte. Tratar 24 como hora 0 do dia seguinte
  desloca a série em um dia. (T004)
- O ano das séries é o do **arquivo climático** (2013 nas fixtures), não o da execução. (T007)
- Uma série anual horária cabe numa página: 8 760 pontos, `proximo_cursor: null`. (T003)
- `frequency` e `aggregation` usam grafias diferentes no mesmo objeto: `hourly` e `Avg`. (T003)
- O catálogo é de **tipos** (RDD/MDD) e paginado em 200; `Zone Operative Temperature` foi
  gravada pela execução e **não** aparece na primeira página. (T012)
- Descobrir o que foi gravado é **por tentativa**: variável ausente devolve **422**
  `"variável inexistente nesta simulação"`. O mesmo 422 cobre ambiguidade de chave — só o
  corpo distingue. (T003, T012)
- `Summary.comfort` tem **três** nomes, incluindo `simple_ashrae_55_not_comfortable`. (T005)
- `end_uses` traz os **14 recursos sempre**, inclusive zerados e com unidades mistas
  (GJ e m3). (T008)
- `Summary` real traz `simulation_id` e `status`, que a interface local não modela. (T003)

#### T002 · Liberar séries e estudos no proxy de desenvolvimento — **concluída**

Entregue em [`docs/tasks/T002-allowlist-series-e-estudos.md`](tasks/T002-allowlist-series-e-estudos.md).

O allowlist virou `scripts/simulationRoutes.ts` (módulo puro, 30 testes, antes sem nenhum) e
os identificadores viraram `src/core/ids.ts`. `results/variables`, `results/timeseries` e os
estudos paramétricos passam; `iterations`, `auth`, `api-keys`, `webhooks`, `usage`,
`properties` e a mutação de modelo seguem negados, em `DENIED_BY_DESIGN` — lista exportada e
percorrida pelo teste, para que ampliar as rotas por descuido quebre na hora.

**Dois defeitos pré-existentes encontrados ao escrever os testes que faltavam:**

- O padrão do nome de artefato (`[^/?#]+`) barrava a barra literal mas deixava passar
  `..%2f`, e o proxy repassa a URL crua. Apertado para `[A-Za-z0-9][A-Za-z0-9._-]*`, que
  cobre os 19 nomes que o motor realmente produz.
- **O proxy de produção nunca funcionou:** toda chamada a `/simulation-api` na imagem Docker
  dava **502**. Não era bundle de CA desatualizado — o `openssl` no mesmo contêiner verifica
  a cadeia sem reclamar. Era o `proxy_ssl_verify_depth` do nginx, cujo padrão é 1 contra uma
  cadeia de três níveis. Com `proxy_ssl_verify_depth 3` a série anual responde 200,
  comprimindo 904 KB em 148 KB.

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
- **Indicadores do resumo permanente** — `Summary.comfort` traz **três** nomes, todos em
  horas, confirmados em execução real (T001): `occupied_heating_setpoint_not_met` e
  `occupied_cooling_setpoint_not_met`, que deram **0 h** nas duas execuções observadas —
  coerente com o `NoLimit` acima —, e **`simple_ashrae_55_not_comfortable`**, que deu 332,5 h
  numa delas. Este último é conforto de verdade, é de graça e **sobrevive à retenção que
  apaga o `.sql`**: quando a série responder 410, é o número que resta.
  **A confirmar quando a execução voltar (T016):** se os modelos deste aplicativo produzem
  esse campo — ele depende de os objetos `People` carregarem modelo de conforto. Se
  produzirem, ele vira o indicador de fallback natural; se não, o cálculo sobre a série é a
  única fonte.

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

**Armadilha confirmada na T001:** `end_uses` devolve os **14 recursos sempre**, inclusive
zerados, e com **unidades mistas** — energia em `GJ`, água em `m3`, na mesma lista. Um
gráfico que não filtrar valores nulos desenha 14 séries vazias por categoria, e uma
conversão cega para kWh mente na linha de água.

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

> **Nota da T001 para o seletor de séries.** O catálogo (`/results/variables`) é de tipos
> RDD/MDD e vem paginado em 200: uma variável efetivamente gravada pode **não** estar na
> primeira página. E não existe rota que responda "o que esta execução registrou" — a
> descoberta é por tentativa, tratando o 422. Só o 422 de *variável inexistente* tem
> fixture; o de *ambiguidade de chave* não pôde ser capturado, porque as execuções
> bem-sucedidas disponíveis têm uma zona só. O seletor precisa tolerar essa ausência.

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

### Fora do épico, aberta pela T001

#### T016 · Destravar a execução de simulações no serviço

**Sintoma.** Nenhuma simulação conclui desde 19/09/2026: 8 falhas em 6 modelos diferentes,
todas com `attempts: 3`, ~30 s a 90 s,
`failure_reason: "tentativas esgotadas: a execução falhou repetidamente"`,
`err_available: false`, `entries: []`, `fatal: null` e **zero artefatos**
(`expected_total: 0`, `complete: true`). As três execuções de 16/09 concluíram normalmente
(2,0 s a 24,9 s).

**O que já foi descartado (T001):** o modelo gerado por este aplicativo passa em
`POST /v1/models/{id}/validate` (`{"valido": true, "erros": []}`); falha igual em `annual`
e em `design_day`; e modelos de outras origens também falham no mesmo período. Sem `.err`
e sem artefato nenhum, o EnergyPlus não chegou a escrever — a falha está **antes do motor**.

**Próximo passo:** é uma questão para quem opera o serviço, não para este repositório.
Levar a tabela de execuções e a assinatura da falha. `GET /v1/usage` exigiria escopo
`admin:billing`, então cota não pôde ser descartada daqui.

**Por que não bloqueia o épico E1:** os resultados de 16/09 continuam disponíveis e não
expirados, e deles saíram as fixtures. As tarefas T002–T015 trabalham sobre fixture. O que
fica pendente é a verificação de ponta a ponta com execução nova — e a confirmação de se os
modelos deste app produzem `simple_ashrae_55_not_comfortable` (T005).

#### T017 · CI: o teste de contêiner não exercita o proxy de simulação

**Sintoma.** O job `Validar container Docker` sobe a imagem e faz
`curl -sf http://127.0.0.1:8080/` — só a página estática. Por isso ele passou verde durante
todo o tempo em que **toda** chamada a `/simulation-api` devolvia 502 na imagem
(defeito encontrado e corrigido na T002).

**Entra:** exercitar pelo menos uma rota de proxy no job. Não dá para chamar o serviço real
sem credencial no CI, então a checagem precisa ser de transporte, não de resultado: uma
rota conhecida deve responder algo que **não** seja 502 — 401 sem credencial é resposta
legítima e prova que o handshake TLS com o upstream aconteceu.

**Por que importa:** o `proxy_ssl_verify_depth` quebrou silenciosamente e teria continuado
quebrado. Qualquer mudança futura em `docker/nginx.conf`, no bundle de CAs da imagem base ou
na cadeia de certificados do serviço tem o mesmo perfil — falha só em produção, invisível
para o portão atual.

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

- **Quando a execução volta a funcionar?** Fora do alcance deste repositório — T016.
- **Se `key_value: "*"` no epJSON vira uma série por zona no `.sql`.** Continua aberta: as
  execuções bem-sucedidas disponíveis têm uma zona só (`ZONE ONE`), então a fixture não
  responde. Também é o que impede capturar o 422 de ambiguidade.
- **Se os modelos deste aplicativo produzem `simple_ashrae_55_not_comfortable`.** Depende de
  os objetos `People` carregarem modelo de conforto; só uma execução nova responde (T016).
  Decide se a T005 tem um indicador permanente de fallback ou não.
- **Retenção do `.sql`.** O contrato diz que a série vira 410 depois de um prazo que ele não
  numera. Afeta se vale guardar as séries localmente.
