# Changelog

Todas as mudanças relevantes deste projeto, por tarefa e por versão.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento conforme [SemVer](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Alterado

- **Trocar o vidro no assistente troca também o das janelas desenhadas no Editor 3D** que usavam
  o vidro dele, com a esquadria, e um aviso diz quantas mudaram. Janela com outro vidro,
  escolhido no Modo Especialista ou no Editor 3D, fica como está. Janelas que apontavam para
  um vidro que não existe mais são reparadas na próxima mudança no assistente.
  [ADR-0002](docs/adr/0002-janelas-acompanham-o-vidro-do-assistente.md). (`Refs: T024`)

### Corrigido

- **Trocar o vidro no assistente deixava as janelas desenhadas no Editor 3D apontando para uma
  construção apagada**, e o EnergyPlus parava com `invalid construction_name`. O sync do
  assistente agora mantém o objeto que algo ainda referencia, seguindo a cadeia até o
  material de vidro. (`Refs: T023`)
- **O diálogo de simulação deixava passar referência inexistente**: ela era sempre aviso, e o
  diálogo só bloqueia erro. Construção, material e esquadria inexistentes agora são erro. A
  lista foi medida contra os 752 exemplos oficiais do EnergyPlus, e não tem nenhum falso
  positivo; a regra mais ampla que foi tentada antes bloquearia 25 deles. (`Refs: T023`)

- **Nenhuma simulação concluía no serviço de homologação desde 19/09.** A causa estava no
  serviço, antes do motor: a imagem do EnergyPlus era removida toda madrugada por uma rotina
  de limpeza, e o processo de simulação não tinha permissão para baixá-la de volta. O motor
  nunca chegou a rodar — daí a ausência de `.err`. **O epJSON deste aplicativo nunca foi o
  problema.** Corrigido no serviço; nenhum código deste repositório mudou. O conserto ainda
  precisa ir para o repositório do serviço (T022). (`Refs: T016`)

- O painel de desconforto classificava as horas contra os setpoints do **assistente**, e não
  os do modelo aberto. Como o painel abre execução de outra sessão pelo identificador e o
  Modo Especialista desliga o vínculo com o assistente, as horas podiam ser contadas contra
  uma faixa que não era a do edifício. Agora a faixa vem do termostato do documento, e a
  interface diz de onde ela veio. (`Refs: T011`)

- O dicionário de rótulos em `SimulationDialog.tsx` tinha `InteriorLighting` e
  `InteriorEquipment` grafados **sem espaço**, enquanto a API manda `Interior Lighting` e
  `Interior Equipment`: as duas entradas nunca casaram. Os três indicadores de conforto e
  `unconditioned` não tinham entrada nenhuma e apareciam em inglês cru, como
  `occupied_heating_setpoint_not_met`. (`Refs: T011`)
- O gráfico de usos finais mostrava a categoria em inglês (`Exterior Lighting`). Os testes de
  `usosFinaisEmKwh` cobriam a conversão de unidade e não o rótulo, então o texto em inglês
  não quebrava nada. (`Refs: T011`)
- O relatório da revisão por IA cortava em **cinco achados sem avisar**: quem lesse um PR com
  doze achados veria cinco e concluiria que viu tudo. Agora diz quantos ficaram de fora.
  Apareceu ao escrever o teste do módulo extraído. (`Refs: T020`)

- A revisão por IA podia **passar em silêncio sem ter lido a revisão**: ao tolerar preâmbulo
  em prosa, passou a aceitar o primeiro objeto JSON da resposta, inclusive um exemplo
  ilustrativo escrito antes do objeto real — `findings` vinha vazio e o check obrigatório
  dava verde. Agora o objeto precisa trazer `findings` ou `summary`. (`Refs: T019`)

- A revisão por IA no PR reprovava quando o modelo devolvia o objeto JSON **seguido de
  qualquer sobra** — `json.loads` exige que a string inteira seja um documento só. Como é
  check obrigatório e a saída não é determinística, o bloqueio era por sorte. Agora lê o
  primeiro objeto e ignora o resto, tolerando também cerca de bloco e preâmbulo em prosa. O
  portão não foi afrouxado: resposta ilegível continua reprovando, agora dizendo o que
  recebeu. (`Refs: T018`)

- O eixo de horas do carpete estava invertido: a linha do topo é a hora 1 (intervalo 0h–1h),
  e os rótulos diziam `24h` ali. Só leitura de pixel provou — o desenho parecia plausível nas
  duas orientações. (`Refs: T010`)

- `defaultOn`, em `src/templates/outputs/outputs.json`, era **dado morto**: nada o lia, e o
  conjunto padrão real era uma lista literal em `answers.ts`. As duas fontes coincidiam por
  acaso, e quem tentasse mudar o padrão editando só o JSON não mudaria nada. O padrão agora
  deriva do catálogo. (`Refs: T009`)

- O seletor de modo era um encadeamento de ternários em que **qualquer modo não previsto caía
  silenciosamente no Modo Especialista**. Virou uma tabela por modo: omissão fica visível em
  vez de abrir a tela errada. (`Refs: T006`)
- Modo desconhecido vindo do autosave (versão futura ou storage corrompido) abriria o
  aplicativo numa tela que nenhum componente reconhece. Agora cai no assistente. (`Refs: T006`)

- **O proxy de simulação nunca funcionou na imagem Docker:** toda chamada a
  `/simulation-api` devolvia **502** (`unable to get local issuer certificate`). A causa não
  era bundle de CA desatualizado — o `openssl` no mesmo contêiner verifica a cadeia sem
  reclamar — e sim o `proxy_ssl_verify_depth` do nginx, cujo padrão é 1 contra uma cadeia de
  três níveis. Com `proxy_ssl_verify_depth 3`, a série anual responde 200 pelo contêiner.
  (`Refs: T002`)
- **Travessia de caminho codificada no nome do artefato:** o padrão `[^/?#]+` barrava a
  barra literal, mas `..%2f..%2fetc%2fpasswd` passava, e o proxy repassa a URL crua.
  Apertado para `[A-Za-z0-9][A-Za-z0-9._-]*`, que cobre os 19 nomes que o motor produz.
  (`Refs: T002`)

### Adicionado

- **Painel de horas de desconforto**, que fecha os três painéis do PRD §9: horas frias,
  quentes, confortáveis e **sem dado** lado a lado; barras mensais classificadas; e carpete
  365 × 24 recolorido por estado de conforto. Dois critérios — a faixa fixa dos setpoints do
  projeto e a faixa adaptativa da ASHRAE 55 / EN 16798, esta avisando em quantos dias o
  modelo não valeu e a fixa entrou no lugar. (`Refs: T011`)
- **Dicionário pt-BR dos nomes do resumo** (`src/core/results/rotulos.ts`): usos finais,
  recursos, áreas e indicadores de conforto, com cobertura conferida contra a fixture real da
  API. (`Refs: T011`)
- A revisão por IA do PR saiu do heredoc no YAML e virou `scripts/aiReview/`, com 28 testes
  no Vitest — três tarefas seguidas tinham mexido nas mesmas vinte linhas com verificação
  descartável. O workflow caiu de 297 para 143 linhas. (`Refs: T020`)

- **Painel de temperatura operativa**: curva anual com banda diária de mínima e máxima,
  carpete 365 × 24 hora a hora e a temperatura externa para comparação. Descobre a zona pelo
  422 de ambiguidade quando a execução tem mais de uma, e trata série expirada (410) como
  estado próprio, não como erro. (`Refs: T010`)
- **O preset de conforto passa a vir ligado por padrão**, e com ele a temperatura operativa e
  a externa no epJSON gerado — sem elas, os painéis de temperatura e de horas de desconforto
  não teriam fonte, e a ausência só apareceria depois da execução inteira.
  [ADR-0001](docs/adr/0001-preset-de-conforto-ligado-por-padrao.md). (`Refs: T009`)
- **Painel de consumo anual**: indicadores de consumo medido, consumo por uso final e pico de
  demanda; barras mensais por medidor, agregadas da frequência que a execução tiver; e barras
  por uso final. Distingue medidor **ausente** de medidor **registrado marcando zero** — são
  diagnósticos com correções opostas. (`Refs: T008`)
- Componentes de gráfico próprios, sem dependência nova: `BarChart`, `LineChart` (com banda
  mín/máx, para o pico sobreviver à reamostragem), `StackedBarChart` e `CarpetPlot` (em
  `<canvas>`, com tabela `sr-only` ao lado, porque canvas é invisível para leitor de tela).
  A geometria — escalas, marcações, caminhos SVG, células e cores — fica em
  `src/core/results/plot.ts`, onde o Vitest alcança. O primeiro gráfico já mostra o consumo
  por uso final da execução adotada. (`Refs: T007`)
- **Modo Resultados**, o quarto do aplicativo, com carregamento sob demanda e os quatro
  estados de exceção resolvidos antes dos gráficos: sem execução, em andamento, terminou sem
  sucesso e concluída — com aviso quando a execução foi em dias de projeto, em que consumo
  anual e horas de desconforto não existem. Inclui adoção de uma execução pelo identificador.
  (`Refs: T006`)
- `src/core/results/comfort.ts`: horas de desconforto calculadas da série de temperatura
  operativa, **frio e quente em separado**, com faixa fixa ou adaptativa (ASHRAE 55 /
  EN 16798). A faixa adaptativa devolve nulo fora do domínio de validade em vez de
  extrapolar, e o chamador recebe em quantos dias caiu para a fixa. `summaryComfortHours`
  organiza os três indicadores do resumo permanente, distinguindo "não reportado" de "zero
  horas". (`Refs: T005`)
- `src/core/results/units.ts` e `series.ts`: a aritmética pura sobre a qual os gráficos se
  apoiam — normalização (com contagem de horas sem dado), dia do ano com ano bissexto,
  agregação diária e mensal deduzida do que o serviço diz da série, reamostragem por
  envelope mín/máx que **preserva o pico** e conversão de unidades que recusa o que não é
  energia. 21 asserções, cada uma escrita para falhar sob a implementação ingênua.
  (`Refs: T004`)
- Cliente da API ganha as séries: `variables`, `timeseries` e `allTimeseries` (que segue
  `proximo_cursor` com teto de páginas e reporta se parou nele), mais os tipos em
  `src/core/results/types.ts`. `allTimeseries` interrompe em cursor repetido — só o teto de
  páginas deixaria concatenar cópias da mesma página e devolver série com pontos
  duplicados. **410** vira "série expirada — o resumo permanente continua
  disponível", com `isSeriesExpired`; o corpo `problem+json` do erro passa a ser preservado
  em `SimulationApiError.problem`, sem o qual as candidatas de chave do **422** se perderiam
  na mensagem achatada. (`Refs: T003`)
- Portão no CI para o proxy de simulação no contêiner: chama `/simulation-api/v1/engines` e
  reprova se o log do nginx tiver `SSL certificate verify error`. O healthcheck anterior só
  buscava a página estática e por isso ficou verde durante todo o tempo em que o proxy
  devolvia 502. (`Refs: T017`)
- Rotas de série (`results/variables`, `results/timeseries`) e de estudo paramétrico
  (`/v1/studies`, `…/runs`, `…/results`, `…/cancel`) liberadas no proxy de desenvolvimento,
  com query string. Antes respondiam 404 do próprio proxy. (`Refs: T002`)
- `scripts/simulationRoutes.ts`: o allowlist virou módulo puro e testável, com
  `DENIED_BY_DESIGN` exportado e percorrido pelo teste — ampliar as rotas por descuido
  quebra o teste. 30 asserções onde antes não havia nenhuma. (`Refs: T002`)
- `src/core/ids.ts`: padrões de identificador da API num lugar só, eliminando as três
  cópias do ULID. (`Refs: T002`)
- `docker/nginx.conf`: `gzip_proxied any` (sem ele o nginx **nunca** comprime resposta de
  proxy — a série anual cai de 904 KB para 148 KB), HTTP/1.1 no upstream, buffers de
  32k/16×64k/128k e `proxy_read_timeout 120s`. (`Refs: T002`)
- Script opcional `scripts/capture-results-fixtures.ts`: captura de uma execução concluída
  (`SIMULATION_ID=sim_…`) ou executa uma simulação **anual** nova, e grava em
  `src/core/results/__fixtures__/` o formato real de resumo, catálogo de variáveis, séries
  temporais e artefatos, com identificadores da conta higienizados. Base factual do épico
  de dashboards: tipos e gráficos passam a ser escritos contra dado observado, não contra a
  prosa do OpenAPI. (`Refs: T001`)
- `src/core/results/__tests__/fixtures.test.ts`: 12 asserções travando o contrato
  observado — a hora 24 como fim do intervalo, o ano vindo do arquivo climático, o catálogo
  de tipos paginado, o 422 de variável não registrada e os três indicadores de conforto do
  resumo permanente. (`Refs: T001`)
- `docs/backlog.md`: quadro do épico E1 — Dashboards de Análise Energética e Estudos,
  com 15 tarefas, dependências e as armadilhas levantadas no contrato da API.
- `CHANGELOG.md` e `MEMORY.md`, exigidos pelo `AGENTS.md` §3 e até então inexistentes.
  (`Refs: T001`)
- `src/core/results/__fixtures__/README.md`: proveniência das fixtures, o que foi alterado
  em relação à resposta original e o aviso de que `_pontos_na_pagina_original` é campo
  sintético do script, não da API. (`Refs: T001`)
- Guarda de regressão da higienização: varre **todos** os arquivos do diretório de fixtures
  — inclusive os que o teste não importa — e recusa identificador real da conta, `owner`
  de tenant ou `request_id` não substituído. Também verifica que os próprios marcadores
  respeitam os padrões de identificador do contrato. (`Refs: T001`)

### Documentado

- `docs/DEVELOPMENT.md`: a execução no serviço **não conclui desde 19/09/2026** — 8 falhas
  em 6 modelos diferentes, sem `.err` e sem artefato nenhum, enquanto o modelo gerado aqui
  passa em `POST /models/{id}/validate`. Substitui o registro anterior de que nenhuma
  simulação jamais tinha concluído. Acompanhamento na T016 do backlog. (`Refs: T001`)

### Corrigido

- `AGENTS.md` §2 e §3 diziam `docs/tasks/NNN-slug.md`, enquanto o template da tarefa, o
  nome da branch e o rodapé do commit usavam `TNNN`. Padronizado em `TNNN`. (`Refs: T001`)
- Dois marcadores de higienização tinham corpo ULID curto (`mdl_` com 25 e `mv_` com 24
  caracteres, contra os 26 do contrato), contrariando a promessa de que casariam com os
  padrões. Ainda não haviam vazado para nenhuma fixture. (`Refs: T001`)
- `scripts/capture-results-fixtures.ts` não removia aspas ao ler `.env.local`, divergindo
  do `loadEnv` do Vite que o proxy usa sobre o mesmo arquivo: `TOKEN="abc"` viraria um
  Bearer com aspas e daria 401 sem explicação. O token também passou a entrar no mapa de
  higienização, por precaução. (`Refs: T001`)

## [0.1.0] — 2026-09-22

Primeira versão com os três modos de edição e a integração de simulação.

### Adicionado

- Assistente guiado de 10 etapas, gerando epJSON completo a cada resposta.
- Editor 3D com espessura real de materiais, paredes e lajes compartilhadas, aberturas
  entre zonas térmicas e elevação 2D interativa.
- Modo Especialista dirigido pelo schema oficial do EnergyPlus 26.1, com validação Ajv
  contínua e editor CodeMirror sincronizado.
- Planta 2D por ambientes, com divisão de paredes em encontros em T.
- Integração com a API de simulação em homologação: upload do modelo, execução,
  acompanhamento de status, diagnósticos e artefatos.
- Imagem Docker multi-stage servindo o build estático por Nginx.
