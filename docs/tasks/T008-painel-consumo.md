# T008: Painel de consumo anual

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T008-painel-consumo`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; T004 (agregação), T007 (gráficos)

---

## 1. Objetivo

O primeiro dos três painéis do PRD §9: consumo anual, com indicadores, barras mensais por
medidor e o resumo por uso final.

---

## 2. Escopo

### O que entra

- `src/features/results/resultsStore.ts`: busca as séries de medidor da execução adotada.
- `src/features/results/panels/ConsumoPanel.tsx`, com `mensalEmKwh` exportada e testada.
- Três indicadores, barras mensais, barras por uso final, e os estados de exceção.
- 6 asserções novas.

### O que NÃO entra (deliberadamente postergado)

- Temperatura operativa e carpete — **T010**.
- Horas de desconforto — **T011**.
- Seletor de séries arbitrárias — **T012**.

---

## 3. Decisões tomadas

- **O painel agrega a frequência que encontrar, em vez de exigir medidor mensal.** O backlog
  previa ler os medidores mensais do preset `conta`. A execução real disponível **não tem
  nenhum deles**: gravou `EnergyTransfer:Facility` **por hora**. Um painel que só soubesse
  ler medidor mensal ficaria vazio diante de dado que existe. `aggregateMonthly` da T004 já
  resolve, e a decisão de somar ou mediar vem de `defaultAggregation`, isto é, do que o
  serviço diz da série.

- **A descoberta de medidores é por tentativa, não pelo catálogo.** `/results/variables` é de
  **tipos** vindos do RDD/MDD e não diz o que a execução gravou — a T001 confirmou isso com
  uma variável registrada que nem aparecia na primeira página do catálogo. O 422 é a resposta
  esperada para "não registrou", e entra em `ausentes`, não em erro.

- **`EnergyTransfer` está na lista de medidores procurados.** Com
  `ZoneHVAC:IdealLoadsAirSystem`, que é o que este aplicativo gera, a climatização **não**
  aparece como `Electricity`.

- **Nada do que o store carrega é persistido.** Um ano horário são 8 760 pontos por variável;
  gravá-los em `sessionStorage` estouraria a cota, além de contrariar a regra de que
  resultados ficam só em memória (AGENTS.md §7).

- **Medidor zerado e medidor ausente têm mensagens diferentes.** Ver §6.

- **Não abrir ADR.** É implementação do que o backlog decidiu (AGENTS.md §4).

---

## 4. Alterações realizadas

- `src/features/results/resultsStore.ts`: novo.
- `src/features/results/panels/ConsumoPanel.tsx`: novo.
- `src/features/results/ResultsShell.tsx`: o gráfico solto da T007 deu lugar ao painel.
- `src/features/results/__tests__/consumo.test.ts`: novo, 10 testes.
- `src/features/results/__tests__/resultsStore.test.ts`: novo, 5 testes.
- `src/features/simulation/api.ts`: `timeseries` e `allTimeseries` aceitam `AbortSignal`.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 230 testes (eram 215; +15 nesta tarefa, 9 deles vindos da revisão do PR)
- [x] `npm run build`
- [x] **No navegador, contra o serviço real** (`sim_01M2NEQ…`): indicadores corretos
      (23.072 kWh por uso final, pico de 5,3 kW), sete medidores procurados com **um 200 e
      seis 422**, e a mensagem certa para o medidor encontrado e zerado.

---

## 6. Observações / armadilhas para tarefas futuras

**"Nenhum medidor registrado" e "medidor registrado marcando zero" são diagnósticos
diferentes, com correções opostas.** A primeira versão do painel dizia *"Esta execução não
registrou nenhum medidor de energia"* — e a execução **tinha** registrado
`EnergyTransfer:Facility`, com 8 760 pontos, todos zero. A mensagem mandava o usuário marcar
uma saída que já estava marcada, para procurar um problema que não estava lá. Agora o painel
separa os dois casos: ausência manda ajustar as saídas antes de simular; zerado diz que é
resultado do modelo e sugere conferir cargas e climatização.

Foi encontrado porque a verificação foi feita **contra dado real**, não contra fixture
montada para o caso feliz. A série existia, a requisição devolveu 200, e ainda assim a tela
mentia.

**Trocar de execução no meio da carga travava o painel para sempre.** A carga antiga
abandonava sem repor `carregando: false`, e um guarda por `carregando` impedia a nova de
começar: "Lendo os medidores…" indefinidamente. Agora cada carga tem uma geração, a mais nova
assume, e um `AbortController` interrompe as requisições em voo — que de outro modo
continuariam baixando séries de 8 760 pontos que ninguém mais veria. Veio da revisão do PR,
com prova negativa: o teste do store reprova sob o código anterior.

**Converter pico dividindo por mil às cegas era um erro esperando unidade diferente.** O
resumo real traz `W`, mas nada no contrato garante isso — um pico já em `kW` apareceria como
0,005 kW, plausível e errado por três ordens de grandeza. `picoEmKw` olha a unidade e devolve
`null` no que não reconhece.

**A execução disponível tem consumo só em iluminação externa.** `EnergyTransfer:Facility`
marca zero o ano inteiro, e nenhum medidor elétrico foi registrado. Isso limita a
verificação visual das barras mensais e da pilha: nenhuma das duas recebeu dado não nulo
ainda. **A T010 e a T011 devem reconferir quando houver execução com consumo distribuído** —
e a T016, se destravar a execução, produzirá uma.

**Mês sem ponto vale zero na barra mensal, ao contrário do gráfico de série.** São doze
posições fixas: se um mês sumisse da lista, "fevereiro" apareceria sob o rótulo de março.
No gráfico de série, a lacuna deve aparecer como lacuna — `polylinePath` quebra a linha.
