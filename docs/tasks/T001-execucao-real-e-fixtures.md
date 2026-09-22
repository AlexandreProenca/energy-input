# T001: Execução real bem-sucedida e captura de fixtures

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T001-execucao-real-e-fixtures`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; [`PRD.md`](../PRD.md) §9 item 1

---

## 1. Objetivo

O épico de dashboards depende de saber o formato real das respostas de resultados da API.
Até aqui, `docs/DEVELOPMENT.md` registrava que **nenhuma simulação jamais concluíra** no
serviço — logo `Summary`, séries temporais e artefatos nunca tinham sido observados.
Desenhar gráficos contra formato adivinhado é retrabalho garantido.

Esta tarefa obtém dado real e o congela como fixture, ou — se não houver execução
bem-sucedida — entrega o diagnóstico e para o épico.

---

## 2. Escopo

### O que entra

- `scripts/capture-results-fixtures.ts`: captura de `results/summary`, `results/variables`,
  `results/timeseries` e `artifacts`, com dois modos (execução existente ou nova).
- Fixtures reais em `src/core/results/__fixtures__/`.
- `src/core/results/__tests__/fixtures.test.ts`: 12 asserções que travam o contrato
  observado.
- `CHANGELOG.md` e `MEMORY.md`, exigidos pelo `AGENTS.md` §3 e até então inexistentes.
- Correção da divergência `NNN` × `TNNN` em `AGENTS.md` §2 e §3.
- Diagnóstico da falha de execução em `docs/DEVELOPMENT.md`.

### O que NÃO entra (deliberadamente postergado)

- Qualquer interface ou gráfico — Fase 2 do backlog (T006 em diante).
- Tipos e métodos de série no cliente da API — **T003**, que consome estas fixtures.
- Investigar e destravar a execução de modelos gerados pelo app — **T016**, aberta por
  esta tarefa.
- Fixture de **ambiguidade** de chave: não foi possível capturar (veja §6).

---

## 3. Decisões tomadas

- **Fixtures em `src/core/results/__fixtures__/`, não em
  `src/features/simulation/__tests__/`** como dizia a linha original do backlog. Os
  consumidores principais são os módulos puros de `src/core/results/` (T004, T005), e
  `src/core/` não pode depender de `src/features/` (AGENTS.md §7). O cliente da API
  também as importa — de `core` para `features` a direção é permitida.

- **Capturar de uma execução concluída em vez de insistir numa nova.** O script ganhou o
  modo `SIMULATION_ID=…`. Como nenhuma execução nova conclui desde 19/09 mas as de 16/09
  continuam com resultados não expirados, esse modo é o que destravou o épico. Ele também
  é o modo barato no dia a dia: não gasta cota nem depende do worker.

- **Identificadores trocados por marcadores estáveis que ainda casam com os padrões do
  contrato** (`sim_`, `mv_`, `mdl_`, `wx_` + corpo ULID). Preserva a capacidade de validar
  formato nos testes sem versionar identificadores da conta. Números, nomes de campo e
  nomes de objeto do modelo ficam byte a byte.

- **Séries recortadas a 48–72 pontos, com `_pontos_na_pagina_original` preservado.** Uma
  página horária anual tem 8 760 pontos e passa de 1 MB; a fixture existe para fixar
  formato, não volume. O total real fica registrado no próprio arquivo, e é ele que o
  teste usa para afirmar que o ano inteiro cabe numa página.

- **Descoberta de séries por tentativa, não pelo catálogo.** O catálogo é de tipos
  (RDD/MDD) e paginado; foi confirmado que uma variável efetivamente gravada pode não
  aparecer na primeira página. A lista de variáveis procuradas é explícita no script e o
  que não existir é reportado, não silenciado.

- **Não abrir ADR.** Nada aqui contraria ou estende o PRD: é levantamento factual e
  documentos de processo (AGENTS.md §4, "escolha local, óbvia dado o contexto").

---

## 4. Alterações realizadas

- `scripts/capture-results-fixtures.ts`: novo. Lê o token de `SIMULATION_API_TOKEN` ou de
  `.env.local`, fala direto com `https://homolog.ee.dev.br/v1` (Node não tem CORS, então
  não depende do proxy do Vite) e grava as fixtures higienizadas.
- `src/core/results/__fixtures__/*.json`: 8 respostas reais.
- `src/core/results/__tests__/fixtures.test.ts`: novo, 12 testes.
- `docs/DEVELOPMENT.md`: substituído o parágrafo "a validação real … permanece pendente"
  pelo estado observado; nova seção "Fixtures reais de resultados" com as descobertas.
- `AGENTS.md`: `docs/tasks/NNN-*.md` → `docs/tasks/TNNN-*.md` (§2 e §3).
- `CHANGELOG.md`, `MEMORY.md`: criados.
- `docs/backlog.md`: T001 concluída; T003, T005, T008 e T012 revisadas com o que as
  fixtures ensinaram; T016 aberta.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 69 testes (eram 57; +12 nesta tarefa)
- [x] `npm run build`
- [x] Captura real executada contra o serviço: `SIMULATION_ID=… npx tsx
      scripts/capture-results-fixtures.ts` gravou as 8 fixtures.
- [x] Execução anual nova tentada de ponta a ponta (modo 2 do script) — **falhou**, e o
      diagnóstico está em `docs/DEVELOPMENT.md` e na T016.
- [x] Conferido que nenhum identificador real da conta sobrou nas fixtures.

---

## 6. Observações / armadilhas para tarefas futuras

**A execução no serviço está quebrada desde 19/09/2026.** 8 falhas consecutivas em 6
modelos diferentes, todas com `attempts: 3`, `err_available: false` e **zero artefatos**.
O modelo gerado por este app passa em `POST /models/{id}/validate` e falha igual em
`annual` e `design_day`. Sem `.err`, o EnergyPlus não chegou a rodar. Detalhe e tabela em
`docs/DEVELOPMENT.md`; acompanhamento na T016. **Não reporte essa falha como problema do
epJSON sem evidência nova** — e não reporte como sucesso da simulação.

**A hora 24 é o fim do intervalo e pertence ao dia anterior.** `month: 1, day: 1, hour: 24`
tem `timestamp: 2013-01-02T03:00:00Z` com `utc_offset_hours: -3`. Tratar 24 como hora 0 do
dia seguinte desloca a série inteira em um dia. O teste `fixtures.test.ts` trava isso com
dado real, inclusive a contraprova de que um dia tem exatamente 24 baldes, de 1 a 24.

**O catálogo de variáveis não responde "o que esta execução gravou".** Ele é RDD/MDD — o
que o modelo *poderia* relatar — e é paginado em 200. `Zone Operative Temperature` foi
gravada por esta execução e **não** está na primeira página. Qualquer seletor de séries
(T012) precisa paginar até o fim, ou sondar e tratar o 422.

**O 422 cobre dois casos distintos.** "Variável inexistente nesta simulação" e ambiguidade
de chave usam o mesmo código; só o corpo (`errors[].message`) distingue. Só o primeiro
caso foi capturado: as duas execuções bem-sucedidas disponíveis têm uma zona só
(`ZONE ONE`), então não há como provocar ambiguidade nelas. A fixture de ambiguidade fica
pendente até existir uma execução multizona — a T012 precisa tolerar sua ausência.

**`Summary.comfort` tem um indicador de conforto de verdade.** Além de
`occupied_heating_setpoint_not_met` e `occupied_cooling_setpoint_not_met` — ambos 0 h nas
duas execuções, coerente com `IdealLoadsAirSystem` sem limite —, existe
`simple_ashrae_55_not_comfortable`, que deu 332,5 h numa das execuções. É permanente e
sobrevive à retenção do `.sql`. Revê em parte a premissa da T005: o resumo não é só
"horas fora do setpoint". Vale confirmar, quando a execução voltar, se os modelos deste
app produzem esse campo — ele depende dos objetos `People` carregarem modelo de conforto.

**`end_uses` sempre traz os 14 recursos, com unidades mistas.** Energia em GJ e água em
m3, na mesma lista. Gráfico que não filtrar valores nulos desenha 14 séries vazias por
categoria; conversão cega para kWh mente na linha de água.

**O ano das séries é o do arquivo climático**, não o da execução: 2013 nas fixtures.
Eixos de tempo não devem assumir o ano corrente.
