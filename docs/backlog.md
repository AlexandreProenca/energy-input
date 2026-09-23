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
| [x] | T003 | Tipos e métodos de série temporal no cliente da API | T001, T002 |
| [x] | T004 | `core/results/series.ts` — agregação, reamostragem e conversão de unidades | T001 |
| [x] | T005 | `core/results/comfort.ts` — horas de desconforto | T004 |
| [x] | T006 | Casca do modo Resultados | T003 |
| [x] | T007 | Componentes de gráfico SVG reutilizáveis | T004, T006 |
| [x] | T008 | Painel de consumo anual | T007 |
| [x] | T009 | Ligar o preset `conforto` por padrão e fechar a divergência de defaults — **ADR** | T001 |
| [x] | T010 | Painel de temperatura operativa | T007, T009 |
| [x] | T011 | Painel de horas de desconforto | T005, T007, T009 |
| [ ] | T012 | Tipos e métodos de estudo no cliente da API | T002 |
| [ ] | T013 | `studyStore.ts` — acompanhamento do estudo | T012 |
| [ ] | T014 | Montar cenários e criar o estudo | T013 |
| [ ] | T015 | Tabela comparativa e gráfico do estudo | T014, T007 |
| [x] | T016 | Destravar a execução de simulações no serviço | — |
| [x] | T018 | Revisão por IA no PR cai quando o modelo devolve JSON com sobra | — |
| [x] | T019 | Revisão por IA podia passar em silêncio sem ter lido a revisão | T018 |
| [x] | T020 | Tirar a revisão por IA do heredoc e pô-la em módulo testado | T019 |
| [ ] | T021 | Download de artefato devolve URL interna em HTTP (serviço) | — |
| [ ] | T022 | Tornar durável o conserto do motor, no repositório do serviço | T016 |
| [x] | T023 | O sync do assistente não pode deixar referência órfã | — |
| [x] | T024 | As janelas desenhadas pelo usuário acompanham o vidro do assistente — **ADR** | T023 |
| [x] | T025 | Painéis de temperatura e desconforto com mais de uma zona | T010 |
| [x] | T026 | O assistente em sete páginas | — |
| [ ] | T027 | Chave da API por variável de ambiente, também no contêiner — **ADR** | — |
| [ ] | T028 | Acompanhamento da simulação e "Analisar resultados" | T027 |
| [x] | T029 | Revisão por IA reprovava com a resposta cortada pelo limite de tokens | T020 |
| [x] | T030 | Revisão por IA: escape inválido e diagnóstico que distingue as causas | T029 |
| [x] | T017 | CI: o teste de contêiner não exercita o proxy de simulação | T002 |

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

#### T003 · Tipos e métodos de série temporal no cliente — **concluída**

Entregue em [`docs/tasks/T003-cliente-series-temporais.md`](tasks/T003-cliente-series-temporais.md).

Os tipos ficaram em `src/core/results/types.ts`, não em `features/`, porque a T004 e a T005
os consomem e `src/core/` não pode importar de `features/`. O cliente reexporta.

`SimulationApiError` passou a carregar o corpo `problem+json`: o `request` achata o erro numa
mensagem legível, mas isso perdia `errors[]` — e no 422 de ambiguidade são as **candidatas de
chave**, única fonte delas, já que o catálogo é por tipo. Helpers `isSeriesExpired` (410) e
`seriesCandidates` (422).

`allTimeseries` segue `proximo_cursor` com teto de páginas e devolve `completa`/`paginas`:
uma série anual cabe numa página só, então o teto só morde num cursor que não avança — mas
devolver meia série calada faria um gráfico plausível e errado.

Verificado contra o serviço real: 8 760 pontos numa página, `completa: true`, e **365 pontos
com `hour: 24`** — um por dia, a convenção da T001 confirmada em dado vivo. **A T004 precisa
disso ao montar os baldes diários.**

#### T004 · `core/results/series.ts` — agregação e reamostragem — **concluída**

Entregue em [`docs/tasks/T004-series-agregacao.md`](tasks/T004-series-agregacao.md).

`units.ts` (`toKwh`, `isEnergyUnit`, `normalizeUnit`, `formatUnit`) e `series.ts`
(`normalizeSeries`, `dayOfYear`, `defaultAggregation`, `aggregateDaily`, `aggregateMonthly`,
`downsampleEnvelope`). 21 asserções, todas com contraprova.

**O que a T007 precisa saber ao desenhar:**

- Os componentes recebem baldes prontos e **não calculam nada** — a aritmética toda está aqui.
- `normalizeSeries` devolve `dropped`: o painel tem de dizer "N horas sem dado", senão o
  gráfico mente por omissão.
- Cada balde traz `count`, que distingue dia cheio de dia parcial — dá para esmaecer o
  trecho incompleto em vez de desenhá-lo com a mesma confiança.
- Balde sem ponto **não existe**, em vez de valer zero: dia sem medição não é dia de consumo
  nulo.
- `downsampleEnvelope` devolve `{x, min, max, mean, count}`: desenhe a banda mín/máx **e** a
  linha da média. Só a média perderia o pico, que é o número que o engenheiro procura.
- `toKwh` devolve `null` quando a unidade não é de energia — `end_uses` mistura `GJ` e `m3`
  na mesma lista. Tratar o `null`, nunca cair para o valor cru.

#### T005 · `core/results/comfort.ts` — horas de desconforto — **concluída**

Entregue em [`docs/tasks/T005-horas-de-desconforto.md`](tasks/T005-horas-de-desconforto.md).

`hoursOutsideBand` (frio e quente separados, com classificação por hora para o carpete),
`adaptiveBand` / `runningMeanOutdoor` / `adaptiveDiscomfort` (ASHRAE 55 / EN 16798, com queda
para a faixa fixa onde o modelo não vale) e `summaryComfortHours`. 20 asserções.

**O que a T011 precisa mostrar, além do total:**

- **`fallbackDays`** — em quantos dias a faixa adaptativa não valeu e a fixa entrou no lugar.
  Faixa que troca de critério no meio do ano sem avisar é gráfico que mente.
- **`dropped`** (da T004) — horas não medidas. Não contam nem como conforto nem como
  desconforto, e o painel precisa dizê-lo.
- **Frio e quente em separado.** 800 horas quentes pedem sombreamento e ventilação; 800
  frias pedem isolamento e ganho solar. O agregado esconde a decisão.
- Os indicadores de setpoint do resumo deram **0 h** nas duas execuções reais, como o
  `NoLimit` do `IdealLoadsAirSystem` prevê. Exibi-los como "desconforto" mostraria zero para
  sempre — o rótulo honesto é "horas fora do setpoint".

**Respondido na T011, sem depender da T016.** O EnergyPlus local basta: rodando o modelo
padrão do gerador, anual, a linha "Time Not Comfortable Based on Simple ASHRAE 55-2004" dá
**7 587 h**, enquanto as duas de setpoint dão 0,00. O ASHRAE 55 simples **é** fallback de
verdade quando a série expira; os de setpoint não são.

### Fase 2 — Modo Resultados e gráficos

#### T006 · Casca do modo Resultados — **concluída**

Entregue em [`docs/tasks/T006-modo-resultados.md`](tasks/T006-modo-resultados.md).

Quarto modo aberto, com `lazy()` confirmado por chunk próprio no build. Quatro estados de
exceção resolvidos **antes** dos gráficos, para que os três painéis não inventem cada um o
seu: sem execução, em andamento, terminou sem sucesso, e concluída. Adoção por identificador
disponível nos três estados em que cabe.

**Para a T007 e os painéis:**

- O ternário de modos virou a tabela `MODOS` em `App.tsx`. Modo novo sem entrada ali não
  renderiza nada específico, em vez de cair calado no `ExpertShell`.
- O aviso de **dias de projeto** já está na casca: consumo anual e horas de desconforto não
  existem nessas execuções, e os painéis não precisam repeti-lo.
- **Falta o quinto estado — série expirada (410)** —, que entra na T010 porque só aparece
  quando houver consulta de série. `isSeriesExpired` já existe no cliente (T003); o painel
  cai para o resumo permanente com aviso, nunca para tela de erro.
- Campo com ação por `Enter` lê `e.currentTarget.value`, não a variável de estado: com
  digitação rápida o fecho do render fica desatualizado e a tecla não faz nada, sem erro.

#### T007 · Componentes de gráfico SVG — **concluída**

Entregue em [`docs/tasks/T007-componentes-de-grafico.md`](tasks/T007-componentes-de-grafico.md).

`src/core/results/plot.ts` (escalas, marcações, caminhos SVG, células do carpete, cor
divergente) com 17 asserções, e `src/features/results/charts/` com `ChartFrame`, `BarChart`,
`LineChart`, `StackedBarChart` e `CarpetPlot`. O primeiro gráfico já está ligado ao resumo
real na casca.

**Para a T008 e a T010:**

- Os componentes **não calculam nada**: recebem baldes da T004 e cores da `plot.ts`.
- Todo gráfico passa pelo `ChartFrame`, que **exige** `label` — `<svg>` sem nome acessível é
  invisível para leitor de tela (PRD §5.2).
- `LineChart` recebe `EnvelopeBucket[]` e desenha **banda mín/máx e média**. Só a média
  jogaria fora o pico que a reamostragem preservou.
- `CarpetPlot` é `<canvas>` e leva tabela `sr-only` junto; passe `resumoMensal`.
- **Só o `BarChart` foi verificado com dado real na tela.** Os outros três dependem de série
  temporal, que chega à interface na T010 — até lá a garantia é a geometria pura.
- **A execução disponível tem um único uso final com consumo** (23.072 kWh em iluminação
  externa). Há teto de largura de barra por causa disso; conferir o visual de muitas barras
  quando existir execução com mais usos.

#### T008 · Painel de consumo anual — **concluída**

Entregue em [`docs/tasks/T008-painel-consumo.md`](tasks/T008-painel-consumo.md).

`resultsStore` (busca de medidores, nada persistido) e `ConsumoPanel` com indicadores,
barras mensais e barras por uso final.

**Desvio do que este backlog previa:** o painel **agrega a frequência que encontrar** em
meses, em vez de ler os medidores mensais do preset `conta`. A execução real não tem nenhum
deles — gravou `EnergyTransfer:Facility` **por hora**. Um painel que só lesse medidor mensal
ficaria vazio diante de dado que existe.

**Para a T010 e a T011:**

- A descoberta de série é **por tentativa**, tratando o 422 como ausência esperada. O
  catálogo não diz o que foi gravado.
- Nada do que o store carrega é persistido: 8 760 pontos por variável estouram a cota do
  `sessionStorage`, e resultados ficam só em memória por regra (AGENTS.md §7).
- **"Ausente" e "zerado" precisam de mensagens diferentes.** A execução disponível registrou
  um medidor que marca zero o ano inteiro; dizer "não registrou nenhum medidor" mandava o
  usuário corrigir o que já estava certo.
- **As barras mensais e a pilha ainda não receberam dado não nulo.** A execução disponível
  só tem consumo em iluminação externa. Reconferir quando houver execução com consumo
  distribuído — a T016 produzirá uma, se destravar.

#### T009 · Ligar o preset `conforto` por padrão — **concluída**

Entregue em [`docs/tasks/T009-preset-conforto-padrao.md`](tasks/T009-preset-conforto-padrao.md),
com [ADR-0001](adr/0001-preset-de-conforto-ligado-por-padrao.md) — o primeiro ADR do
repositório.

O padrão passou de `["resumo","cargas","conta"]` para
`["resumo","conforto","cargas","conta"]`, e o epJSON gerado agora traz
`Zone Operative Temperature` e `Site Outdoor Air Drybulb Temperature`.

**A metade que faltava:** `defaultOn` era dado morto — nada o lia, e o padrão real era uma
lista literal em `answers.ts`. Editar só o JSON não mudaria nada. Agora o padrão **deriva** do
catálogo, com teste travando isso e prova negativa.

#### T010 · Painel de temperatura operativa — **concluída**

Entregue em [`docs/tasks/T010-painel-temperatura.md`](tasks/T010-painel-temperatura.md).

Curva anual com banda diária, carpete 365 × 24 e a externa para comparação. Fecha o **quinto
estado** previsto na T006 (série expirada, 410) e a lacuna de verificação da T007: `LineChart`
e `CarpetPlot` receberam dado real.

**Para a T011:**

- A zona é descoberta pelo **422 de ambiguidade**, não pelo catálogo — `seriesCandidates`
  (T003) transforma o erro no seletor. A execução disponível tem uma zona só, então esse
  caminho não foi exercitado com dado real.
- `interna` e `externa` já estão no store; a externa é opcional e só a faixa adaptativa
  precisa dela.
- **O eixo de horas do carpete foi corrigido:** linha 0 é a hora 1 (0h–1h) e fica no topo.
  Só leitura de pixel provou — o desenho parecia certo nas duas orientações, porque a
  madrugada é fria nas duas pontas.
- O `StackedBarChart` **continua sem dado não nulo**: depende de vários medidores com
  consumo, e a execução disponível tem um só, zerado.

#### T011 · Painel de horas de desconforto — **concluída**

Entregue em [`docs/tasks/T011-painel-desconforto.md`](tasks/T011-painel-desconforto.md).
**Fecha a Fase 2 e os três painéis do PRD §9.**

Frio e quente separados, com os dois critérios (faixa fixa dos setpoints e faixa adaptativa),
horas sem dado à vista, `fallbackDays` como aviso e carpete recolorido por estado. O
dicionário pt-BR virou `src/core/results/rotulos.ts`, com cobertura conferida contra a
fixture real.

**Para a Fase 3:**

- **Os indicadores de setpoint do resumo são estruturalmente zero nos nossos modelos; o de
  ASHRAE 55 simples não é** (7 587 h no modelo padrão, medido localmente). Tabela comparativa
  de estudo que use `comfort` deve preferir `simple_ashrae_55_not_comfortable`.
- **Antes de acusar o serviço de sub-reportar, conferir se o modelo tinha o que medir.** As
  execuções da T001 dão 0 h porque o modelo não tem ocupante nem climatização
  (`conditioned: 0 m²`), não porque a API erre.
- **Toda tabela de tradução precisa de teste de cobertura derivado de dado real.** Terceiro
  caso de dado morto no repositório, depois de `defaultOn` e da lista literal de `answers.ts`.
- `StackedBarChart` recebeu dado não nulo em três séries: a verificação da T007 está fechada.
- **Pendências que atravessam para a Fase 3:** o seletor de zona nunca foi exercitado com
  execução multizona, e `SimulationDialog` continua sem teste (é `.tsx`, e o Vitest roda em
  `environment: 'node'`).

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

#### T016 · Destravar a execução de simulações no serviço — **concluída**

Entregue em [`docs/tasks/T016-motor-indisponivel.md`](tasks/T016-motor-indisponivel.md).

**A imagem do motor era apagada toda madrugada por uma rotina de limpeza do servidor, e o
processo de simulação não tinha permissão para baixá-la de volta.** A criação do contêiner
falhava em menos de um segundo, o serviço reportava `motor_indisponivel` e desistia depois de
três tentativas. **O EnergyPlus nunca chegou a rodar** — daí a ausência de `.err` e de
artefato. **O epJSON deste aplicativo nunca foi o problema.**

O processo de simulação passou a ter acesso de leitura ao registro de imagens. **Falta
observar a primeira simulação depois de uma limpeza que de fato apague a imagem.** A data
prevista no doc da tarefa (limpeza de 23/09) estava errada: a imagem tinha sido rebaixada
durante o diagnóstico, tinha menos de 24 h no disco e sobreviveu. A primeira simulação de 23/09
a encontrou presente, rodou até o motor e revelou a T023. A limpeza que a pega é a de 24/09.

**O "segundo sintoma" não tinha a mesma origem.** O download de artefato é assinatura de URL,
sem relação com o motor. Virou a T021.

**Destrava o que dependia de execução nova:** a verificação de ponta a ponta dos painéis com
um modelo gerado por este aplicativo, o 422 de ambiguidade de chave (exige execução
multizona) e a política de retenção do `.sql`.

#### T017 · CI: o teste de contêiner não exercita o proxy — **concluída junto da T002**

Aberta e fechada na mesma entrega, por insistência da revisão automática — e com razão:
mandar para a `main` a correção de uma falha silenciosa sem o portão que a detecta deixaria
a próxima regressão igualmente silenciosa (AGENTS.md §8: "ao aceitar um apontamento,
corrija acompanhado de teste").

O job `Validar container Docker` ganhou um passo que chama
`/simulation-api/v1/engines` no contêiner. **O portão não é o código de status**, e sim a
ausência de `SSL certificate verify error` no log do nginx: sem credencial o serviço
responde 401, o que já prova que o handshake TLS aconteceu, e um 502 por serviço fora do ar
viraria aviso, não reprovação — reprovar o CI por indisponibilidade alheia seria ruído.

Verificado por prova negativa: com `proxy_ssl_verify_depth 1` o portão **reprova** (502 e
erro no log); com a config versionada, **aprova** (401).

#### T018 · Revisão por IA no PR cai quando o modelo devolve JSON com sobra

**Sintoma.** O job falhou no PR #2 com
`Resposta do modelo em formato inválido: Extra data: line 3 column 1 (char 4811)`. O
`ai-pr-review.yml` faz `json.loads(content)` sobre a resposta do modelo; quando ela traz o
objeto JSON seguido de qualquer sobra, o `json.loads` levanta e o job inteiro reprova. O
`response_format: json_object` torna isso raro, não impossível.

**Por que importa:** é check obrigatório. Falhar por sorte bloqueia qualquer PR, e a
reexecução resolveu por ser saída não determinística — o que confirma a natureza do
problema em vez de corrigi-lo.

**Concluída.** Entregue em
[`docs/tasks/T018-revisao-json-robusta.md`](tasks/T018-revisao-json-robusta.md). Voltou a
acontecer no **PR #11**, com a mesma assinatura, bloqueando a revisão da T011 — por isso saiu.

`raw_decode` no lugar de `json.loads`, começando na primeira `{` para tolerar preâmbulo, mais
cerca de bloco e log da resposta quando a extração falha. O portão **não** foi afrouxado:
resposta ilegível continua reprovando.

**Fica registrado:** o Python do workflow não é exercitado por nada — nem `npm test`, nem
`tsc` — e só roda com um PR aberto, quando falhar bloqueia em vez de avisar. Se mais lógica
for para lá, o certo é movê-la para um script em `scripts/` que o CI chame.

**Nota:** é workflow do repositório, fora do épico E1 e fora do escopo de qualquer tarefa
dele — por isso tarefa própria, e não carona numa entrega de dashboards.

---

## Documentação obrigatória do épico

Conforme AGENTS.md §4:

ADR recebe número quando é **escrito**, não quando é previsto: reservar número para decisão
que talvez não se tome deixa buraco na sequência e promete documento que não existe.

- **[ADR-0001 — Preset de conforto ligado por padrão](adr/0001-preset-de-conforto-ligado-por-padrao.md)**
  (T009). Muda o arquivo gerado por todo projeto.
- **Estudo paramétrico como unidade de agrupamento e versionamento** — a escrever na T012.
  O conceito não existe no PRD.
- **Séries temporais pela API, em vez de download de artefato:** avaliado na T003 e
  **dispensado**. O PRD §9 já determina o dashboard, e ler a série por uma rota do mesmo
  serviço é aplicar o que ele determina, não estendê-lo — AGENTS.md §4 diz para não abrir ADR
  nesse caso. A decisão está registrada no doc da T003.
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

#### T019 · Revisão por IA podia passar em silêncio sem ter lido a revisão — **concluída**

Entregue em [`docs/tasks/T019-revisao-objeto-certo.md`](tasks/T019-revisao-objeto-certo.md).
**Regressão introduzida pela T018**, apontada pela revisão do próprio PR #12.

Ao varrer todas as chaves de abertura, a T018 passou a aceitar o primeiro `dict` — inclusive
um objeto **ilustrativo** que o modelo escreva antes da revisão. `findings` vinha vazio e o
job dava verde anunciando que não havia achados. O defeito original era barulhento; este era
silencioso, num check obrigatório.

Agora o objeto precisa ter `findings` ou `summary`.

**Fica registrado, e vale além deste workflow:** ao afrouxar o reconhecimento de uma entrada,
conferir separadamente **o que passa a ser aceito** — não basta verificar que o caso que
falhava agora passa.

**E o conserto de fundo continua não feito.** Duas tarefas seguidas mexeram no Python do
`ai-pr-review.yml` com roteiro descartável de verificação, porque ele não é exercitado por
`npm test` nem por `tsc`. Se houver uma terceira, mover a função para `scripts/` com teste de
verdade deixa de ser preferência e vira o trabalho certo.

#### T020 · Tirar a revisão por IA do heredoc e pô-la em módulo testado — **concluída**

Entregue em [`docs/tasks/T020-revisao-em-modulo-testavel.md`](tasks/T020-revisao-em-modulo-testavel.md).
**Paga a dívida que a T018 e a T019 registraram.**

Três tarefas seguidas mexeram nas mesmas vinte linhas de Python dentro do `ai-pr-review.yml`,
cada uma com verificação descartável, e a revisão do PR #13 apontaria uma quarta. O parser, o
relatório e os prompts viraram `scripts/aiReview/`, com 28 testes no Vitest; o workflow caiu
de 297 para 143 linhas. O precedente é a T002, que fez o mesmo com o allowlist do proxy.

**Fica registrado:**

- **O sinal de parar de remendar é a repetição, não o defeito.** Estava escrito no doc da
  T018 antes de a T019 existir, e ainda assim levou mais duas rodadas.
- **Escrever o teste achou um defeito que ninguém reportou:** o corte em cinco achados era
  silencioso desde sempre. Nenhuma das três tarefas anteriores o viu, porque nenhuma teve de
  descrever o comportamento esperado em voz alta.
- **Ambiguidade reprova, em vez de ser resolvida por heurística.** Duas revisões plausíveis
  na mesma resposta não são distinguíveis com confiança, e adivinhar errado faz o portão dar
  verde anunciando zero achado.
- Se outro workflow ganhar lógica não trivial, o lugar dela é `scripts/`.

#### T021 · Download de artefato devolve URL interna em HTTP (serviço)

Separada da T016, onde estava registrada como "segundo sintoma, mesma origem". O
diagnóstico da T016 mostrou que a origem é outra.

`GET /v1/simulations/{id}/artifacts/{nome}` responde `302` para uma URL com **HTTP simples
e hostname interno**, inalcançável de fora. O proxy deste aplicativo recusa corretamente
(`{"detail":"Link de download inválido."}`), porque entregar ao navegador um link não-TLS
exporia o conteúdo do modelo. **O proxy está certo; quem precisa mudar é o serviço**,
assinando a URL com o host público e `https`.

**Não é deste repositório.** Fica aqui para não se perder, como a T016 ficou.

#### T022 · Tornar durável o conserto do motor, no repositório do serviço

Desdobramento da T016. **O conserto foi aplicado na instância, e o próximo deploy do serviço
o desfaz.** Precisa ir para o repositório do serviço, junto com três pendências que o
diagnóstico levantou: manter a credencial em dia quando o token do registro for trocado,
estender o mesmo acesso à API, que usa a mesma imagem, e impedir que a limpeza noturna apague
a imagem do motor.

**O detalhe está no repositório do serviço, que é privado.** Este repositório é público e não
deve descrever a infraestrutura dele.

#### T023 · O sync do assistente não pode deixar referência órfã — **concluída**

Entregue em [`docs/tasks/T023-referencia-preservada-no-sync.md`](tasks/T023-referencia-preservada-no-sync.md).
**Era o defeito do aplicativo que a falha do serviço (T016) escondia:** sem motor, não havia
`.err` para mostrá-lo.

Janelas desenhadas no Editor 3D com o vidro do assistente ficavam apontando para uma construção
que o `planWizardSync` apagava quando o usuário trocava o vidro. O EnergyPlus parava em
`GetSurfaceData` com `invalid construction_name`. Agora o sync retém o objeto do assistente
que algo ainda referencia, seguindo a cadeia até o material de vidro. E a validação trata
referência inexistente em construção, material e esquadria como **erro**, o que bloqueia o
envio — medido contra os 752 exemplos oficiais do EnergyPlus sem nenhum falso positivo.

**Documentos já quebrados não se consertam sozinhos:** o diálogo mostra os erros e aponta as
janelas. A decisão de produto que ficou em aberto — as janelas desenhadas pelo usuário deveriam
acompanhar o vidro do assistente? — foi respondida na T024: **sim**.

#### T024 · As janelas desenhadas pelo usuário acompanham o vidro do assistente — **concluída**

Entregue em [`docs/tasks/T024-janelas-acompanham-vidro.md`](tasks/T024-janelas-acompanham-vidro.md),
com o [ADR-0002](adr/0002-janelas-acompanham-o-vidro-do-assistente.md).

Decisão do dono do produto: trocar o vidro no assistente troca o de **todas** as janelas; para
ajustar uma específica, Modo Especialista. É a única exceção à regra de que o assistente não
altera objeto do usuário, e é **anunciada**: um aviso diz quantas janelas mudaram.

Só mudam as janelas que **seguem** o vidro do assistente. Uma janela com outro vidro é escolha
específica e fica — é o que torna o caminho do Especialista estável. As janelas que o defeito da
T023 deixou apontando para um vidro inexistente são reparadas na próxima mudança no assistente.
Verificado com o EnergyPlus no modelo real que falhou: depois do reparo, roda sem erro grave.

#### T025 · Painéis de temperatura e desconforto com mais de uma zona — **concluída**

Entregue em [`docs/tasks/T025-zonas-multiplas.md`](tasks/T025-zonas-multiplas.md). **Fecha a
pendência que a T010 tinha registrado** — o seletor de zonas nunca exercitado com dado real — e a
lacuna da T001, que não conseguiu capturar o 422 de ambiguidade.

A primeira execução real com duas zonas abriu o painel de temperatura com erro. O parser entregava
a mensagem inteira do 422 (`candidata: key='…', frequency=hourly`) como nome de zona; escolhê-la
mandava esse texto como `key`, e o serviço respondia com o outro 422. **Passou porque os testes
usavam um corpo de 422 inventado**, com a mensagem igual à chave. Agora os testes usam os corpos
reais, capturados e anonimizados.

O painel abre a primeira zona e oferece as outras; o de desconforto diz de qual zona são as
horas. **Em aberto, como decisão de produto:** horas do edifício inteiro, que exigem escolher
critério para agregar zonas.

#### T026 · O assistente em sete páginas — **concluída**

Entregue em [`docs/tasks/T026-assistente-em-sete-paginas.md`](tasks/T026-assistente-em-sete-paginas.md).
Pedido do dono do produto por um fluxo com menos etapas: projeto e clima, materiais e janelas, uso e
climatização passam a dividir página. As **respostas** continuam por etapa — só a navegação foi
agrupada —, e a sessão salva numa etapa que deixou de ser página volta na página que a mostra.

#### T027 · Chave da API por variável de ambiente, também no contêiner

A chave da API de simulação deixa de ser digitada na interface: vem de `SIMULATION_API_TOKEN`, no
servidor de desenvolvimento **e no contêiner de produção**. Nunca no bundle. Como o proxy de
produção repassa qualquer rota, a injeção no servidor exige levar para o nginx a lista de rotas
permitidas que o proxy de desenvolvimento já tem, e ligar o deploy local só em `127.0.0.1`. Muda a
regra do AGENTS.md §7 sobre onde o token pode existir — **ADR**.

#### T028 · Acompanhamento da simulação e "Analisar resultados"

Ao simular, o diálogo passa a mostrar o acompanhamento da execução, e ao concluir oferece
**Analisar resultados**, que leva ao modo Resultados. Sem o campo de chave (T027), o diálogo já abre
conectado.

#### T029 · Revisão por IA reprovava com a resposta cortada pelo limite de tokens — **concluída**

Entregue em [`docs/tasks/T029-revisao-cortada-por-limite.md`](tasks/T029-revisao-cortada-por-limite.md).
No PR #24 o check obrigatório reprovou com "formato inválido" e só `forma: objeto, 8714
caracteres` no log — muito provavelmente um JSON cortado pelo `max_tokens` de 3 500. O
`finish_reason` passou a ser lido e resposta cortada tem diagnóstico próprio; o limite subiu
para 8 000 e o prompt pede no máximo cinco achados. O portão não afrouxou.

#### T030 · Revisão por IA: escape inválido e diagnóstico que distingue as causas — **concluída**

Entregue em [`docs/tasks/T030-revisao-escapes-e-diagnostico.md`](tasks/T030-revisao-escapes-e-diagnostico.md).
**A hipótese da T029 não se sustentou:** com ela na `main`, a revisão do PR #24 reprovou de novo
(`forma: objeto, 6240 caracteres`) sem diagnóstico de corte. A causa provável que sobrou é escape
inválido — o PR cita regex do nginx com `\|` e `\1`. A barra que não começa escape válido passa a
ser dobrada quando a resposta não decodifica, e o log diz se o JSON decodifica, onde está o erro de
sintaxe e as chaves de topo, sem repetir conteúdo. A causa só se confirma na próxima execução.

