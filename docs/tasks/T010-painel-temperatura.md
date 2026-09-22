# T010: Painel de temperatura operativa

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T010-painel-temperatura`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; T004 (agregação), T007 (gráficos), T009 (preset)

---

## 1. Objetivo

O segundo dos três painéis do PRD §9: temperatura operativa ao longo do ano, com banda
diária, carpete hora a hora e a externa para comparação. É também a tarefa que fecha a
lacuna de verificação da T007 — `LineChart` e `CarpetPlot` recebem dado real pela primeira
vez.

---

## 2. Escopo

### O que entra

- `carregarTemperaturas` no `resultsStore`, com descoberta de zona pelo 422 de ambiguidade.
- `src/features/results/panels/TemperaturaPanel.tsx`, com `prepararTemperatura` exportada.
- O **quinto estado**, previsto desde a T006: série expirada (410).
- Seletor de zona quando a execução registrou mais de uma.

### O que NÃO entra (deliberadamente postergado)

- Horas de desconforto e faixa de conforto sobre o gráfico — **T011**.
- Comparar zonas lado a lado: o painel mostra uma por vez.

---

## 3. Decisões tomadas

- **A zona é descoberta pelo 422, não pelo catálogo.** `/results/variables` é de tipos e
  **não traz chave** — a T001 confirmou. Consultar sem `key` resolve direto quando há uma
  zona só, e devolve **422 com as candidatas** quando há várias. `seriesCandidates`, criada
  na T003 exatamente para isto, transforma esse erro no seletor de zonas.

- **A banda diária vem de `downsampleEnvelope` com um balde por dia.** Cada balde reúne as
  24 horas e guarda mínimo, máximo e média — é a amplitude diária que revela inércia térmica
  e ganho solar, e só a média a esconderia. Reusa a função já testada da T004 em vez de somar
  um `aggregateDaily` com mín e máx separados.

- **A externa falta sem invalidar o painel.** Ela só é necessária para a faixa adaptativa da
  T011; a fixa continua valendo. A consulta dela é `.catch(() => undefined)`.

- **Série expirada é estado próprio, não erro.** A simulação existe; o que sumiu foi o
  `.sql`. O painel diz isso e aponta para os indicadores permanentes.

- **Não abrir ADR.** É implementação do que o backlog decidiu (AGENTS.md §4).

---

## 4. Alterações realizadas

- `src/features/results/resultsStore.ts`: `carregarTemperaturas`, `zonas`, `zonaEscolhida`.
- `src/features/results/panels/TemperaturaPanel.tsx`: novo.
- `src/features/results/ResultsShell.tsx`: painel ligado.
- `src/core/results/plot.ts`: rótulos do eixo do carpete corrigidos; `__tests__/plot.test.ts`
  ganha a asserção de orientação.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 236 testes (eram 235)
- [x] `npm run build`
- [x] **No navegador, contra o serviço real** (`sim_01M2NEQ…`):
      - carpete em **365 × 24** — uma coluna por dia, uma linha por hora;
      - a curva anual mostra a sazonalidade do **hemisfério sul**: ~28 °C em janeiro, mínima
        perto de 14 °C em julho, subindo de novo em outubro — coerente com Florianópolis,
        que é o clima da execução;
      - a banda da externa é visivelmente mais ampla que a da interna, que é o efeito da
        envoltória;
      - os três gráficos com nome acessível no `<svg>`/`<canvas>`.

---

## 6. Observações / armadilhas para tarefas futuras

**O eixo das horas do carpete estava invertido, e só a leitura de pixel provou.** A linha 0
do carpete é a hora **1** do contrato — o intervalo 0h–1h — e é desenhada no **topo**; a
linha 23 é a hora 24, na base. Os rótulos diziam `24h` em cima e `0h` embaixo.

Olhar o desenho não bastava: o carpete "parecia certo" nas duas orientações, porque a
madrugada é fria nas duas pontas. A prova foi ler a cor de três pixels da mesma coluna —
topo `rgb(240,169,140)`, meio `rgb(239,140,99)`, base `rgb(240,167,137)`. O **meio** é o mais
quente, como tem de ser no início da tarde, o que fixa a orientação. Há teste em
`plot.test.ts` travando `hour 1 → row 0`, `hour 13 → row 12`, `hour 24 → row 23`.

**Vale como método:** para gráfico cuja aparência é plausível em mais de uma configuração,
a verificação tem de sair do olho e ir para o número.

**A verificação da T007 está fechada.** `LineChart` e `CarpetPlot` receberam dado real — 8 760
pontos, 365 colunas. O `StackedBarChart` continua sem dado não nulo, porque depende de vários
medidores com consumo, e a execução disponível tem um só, zerado (veja T008 §6).

**A execução disponível tem uma zona só (`ZONE ONE`), então o seletor de zonas não foi
exercitado com dado real.** O caminho do 422 de ambiguidade está implementado e depende de
`seriesCandidates`, que tem teste com a fixture do 422 de *variável inexistente* — não do de
ambiguidade, que não foi possível capturar na T001. **Reconferir quando houver execução
multizona.**
