# T011: Painel de horas de desconforto

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T011-painel-desconforto`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; T005 (cálculo), T007 (gráficos), T010 (séries)

---

## 1. Objetivo

O terceiro e último dos painéis do PRD §9, fechando a **Fase 2**. Mostra em quantas horas do
ano o edifício ficou fora da faixa de conforto, **separando frio de quente**, e traz o
dicionário pt-BR que faltava para os nomes do resumo permanente.

---

## 2. Escopo

### O que entra

- `src/features/results/panels/DesconfortoPanel.tsx`, com os dois critérios (faixa fixa dos
  setpoints do projeto e faixa adaptativa da ASHRAE 55 / EN 16798).
- `src/core/results/rotulos.ts` — dicionário pt-BR de usos finais, recursos, áreas e
  indicadores de conforto, com teste de cobertura derivado da fixture real.
- `monthlyStateHours` em `src/core/results/comfort.ts`.
- Carpete recolorido por estado de conforto: `CarpetPlot` ganha cor categórica e legenda.
- O dicionário novo substitui o de sete entradas em `SimulationDialog.tsx` e passa a rotular
  também o gráfico de usos finais da T008.

### O que NÃO entra (deliberadamente postergado)

- Habilitar um modelo de conforto detalhado (Fanger, Pierce) no `People` — veja §6.
- Comparar critérios lado a lado: o seletor mostra um por vez.

---

## 3. Decisões tomadas

- **Frio e quente em separado, sempre.** 800 horas quentes pedem sombreamento e ventilação;
  800 frias pedem isolamento e ganho solar. São decisões de projeto opostas, e o agregado
  único apaga exatamente a informação que orienta o projeto. Com dado real o ponto ficou
  concreto: pela faixa fixa o edifício é predominantemente **quente** (2 766 h contra 867 h);
  pela adaptativa, predominantemente **frio** (2 214 h contra 464 h). Um número só não
  distinguiria os dois diagnósticos.

- **A faixa fixa são os setpoints do próprio projeto**, e não um par de números da
  literatura. É o critério que o usuário declarou no assistente e reconhece ao ver.

- **Horas sem dado ficam ao lado das outras três, não em nota de rodapé.** Sem isso, os três
  indicadores somariam menos de 8 760 sem explicação, e quem conferisse concluiria que a
  conta está errada.

- **`fallbackDays` aparece como aviso, não como detalhe.** Uma faixa que troca de critério no
  meio do ano sem dizer é um gráfico que mente. Com dado real dá 1 dia — o primeiro da
  série, que não tem histórico para a média predominante.

- **Cor categórica no carpete, não escala contínua.** O valor da célula é um estado, e
  interpolá-lo produziria tons entre "frio" e "confortável" que não significam nada.

- **Os indicadores do resumo continuam visíveis mesmo com a série presente**, porque são a
  única coisa que sobrevive quando a retenção apaga o `.sql`. Mas rotulados pelo que são: os
  dois de setpoint medem **controle do sistema**, não conforto.

- **Não abrir ADR.** É implementação do que o backlog decidiu (AGENTS.md §4).

---

## 4. Alterações realizadas

- `src/core/results/rotulos.ts`: novo.
- `src/core/results/comfort.ts`: `monthlyStateHours`.
- `src/features/results/panels/DesconfortoPanel.tsx`: novo.
- `src/features/results/charts/CarpetPlot.tsx`: `cor` e `legenda` opcionais.
- `src/features/results/ResultsShell.tsx`: painel ligado, aviso de "em construção" removido.
- `src/features/results/estado.ts`: usos finais rotulados em pt-BR.
- `src/features/simulation/SimulationDialog.tsx`: dicionário local de sete entradas removido.
- Testes: `__tests__/rotulos.test.ts` (novo, 7), `comfort.test.ts` (+5), `estado.test.ts` (+1).

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 297 testes; +23 desta tarefa (10 vindos das duas rodadas de revisão do PR), o resto das T018–T020
- [x] `npm run build`
- [x] **Prova negativa** da guarda de comprimento em `monthlyStateHours`: removida, o teste
      "recusa emparelhar listas de comprimentos diferentes" reprova; devolvida, passa.
- [x] **No navegador, contra o serviço real** (`sim_01M2NEQ31DJ09TKRQF3V600V42`):
      - **as contas fecham**: 867 + 2 766 + 5 127 = 8 760 horas exatas, e a soma dos doze
        meses do empilhado dá os mesmos 3 633 h fora da faixa que os indicadores;
      - **o carpete confere célula a célula com os indicadores**: lendo os pixels do
        `<canvas>`, exatamente **três** cores distintas (nenhuma interpolação) e a contagem
        de cada uma — 867, 2 766, 5 127 em 365 × 24 — igual à dos `StatTile`;
      - **orientação provada por número**, não pelo desenho: pico de calor em **12h–13h** e
        pico de frio em **4h–5h**;
      - a faixa adaptativa muda o diagnóstico e reporta `fallbackDays` = 1 dia;
      - o `StackedBarChart` recebe dado não nulo em três séries pela primeira vez.

---

## 5.1 Revisão do PR

Quatro achados, todos aceitos.

**O mais importante: a faixa fixa vinha de `answers.hvac`.** Este painel abre execução de
outra sessão pelo identificador — o próprio campo diz "mesmo de outra sessão" — e o Modo
Especialista desliga o vínculo com o assistente (PRD §3.2). Nos dois casos as respostas do
assistente não têm relação com o modelo na tela, e as horas seriam classificadas contra uma
faixa que não é a do edifício: número plausível na tela e indefensável no papel, que é
exatamente o que esta tarefa condena em outros lugares.

Agora a faixa vem do **documento**, por `bandFromDocument` — novo em `src/core/results/`,
puro e com 7 testes. Com recuo noturno ligado, usa o par do período **ocupado**: o
aquecimento mais alto e o resfriamento mais baixo. Sem termostato no documento, cai numa
faixa de referência **e diz que caiu**.

Continua sendo o documento local, não o que foi simulado — a API não devolve os setpoints da
execução. Por isso o painel apresenta a faixa como critério escolhido, e a dica diz de onde
ela veio.

Os outros três:

| Achado | O que mudou |
| --- | --- |
| o carpete indexava `hourly[i]` sem guarda, ao contrário de `monthlyStateHours` | guarda de comprimento; sem ela, hora de frio seria pintada de "confortável" em silêncio |
| `monthlyStateHours` não validava o estado: um quarto valor viraria `NaN` | confere a chave junto com o mês |
| a tabela `sr-only` do carpete dizia "média por mês" para uma soma de horas | `CarpetPlot` ganha `resumoDescricao`; a alternativa textual descreve o que está desenhado |

Numa segunda rodada, mais três, todos aceitos e todos baratos:

- **`bandFromDocument` pegava o primeiro termostato**, o que em documento multizona escolhe
  por ordem de chave. Agora exige que todos concordem; discordando, não há uma faixa do
  edifício e o painel diz isso.
- **O carpete guardava contra comprimento e não contra estado desconhecido** — e o
  comentário reconhecia o primeiro risco sem cobrir o segundo. Estado fora do conjunto vira
  `NaN`, e `carpetCells` descarta célula não finita: a hora não é desenhada, em vez de ser
  pintada de "confortável".
- **`rotuloDoResumo` decide por ordem de cascata**, e o teste de cobertura conferia presença
  de chave, não unicidade. Há asserção de que as tabelas são disjuntas.

---

## 6. Observações / armadilhas para tarefas futuras

**Resolvida uma pergunta que o backlog tinha deixado pendente da T016.** O backlog registrava
como incerto se os modelos deste aplicativo produzem `simple_ashrae_55_not_comfortable`, e
amarrava a resposta a destravar o serviço. Não era preciso: o EnergyPlus 26.1 instalado
localmente responde. Rodando o **modelo padrão do próprio gerador**, anual, o relatório
tabular traz **7 587 h** na linha "Time Not Comfortable Based on Simple ASHRAE 55-2004" —
enquanto as duas linhas de setpoint dão **0,00**, como o `NoLimit` do
`ZoneHVAC:IdealLoadsAirSystem` prevê.

Ou seja: os dois indicadores de setpoint são estruturalmente zero nos nossos modelos, mas o
de ASHRAE 55 **não é** — ele é um fallback de verdade para quando a série expirar.

**O 0 h das execuções reais não é defeito do serviço, é o modelo.** As três execuções
capturadas na T001 dão 0 h nos três indicadores, e a tentação era concluir que a API
sub-reporta. O resumo desmente: `conditioned: 0 m²`, nenhum uso final não-zero além de
`Exterior Lighting`, `peak_demand` só elétrico. O modelo daquelas execuções não tem ocupante
nem climatização — sem gente, não há hora de desconforto para contar. **Vale como método:
antes de acusar o serviço, conferir se o modelo tinha o que medir.** É a mesma armadilha da
T008, em que o painel dizia "não registrou medidor" para uma execução que registrou um
medidor zerado.

**Ligar Fanger ou Pierce no `People` exige três agendas que o gerador não escreve.** Testado:
acrescentar `thermal_comfort_model_1_type: 'Fanger'` produz três `Severe` e um `Fatal` —
`work_efficiency_schedule_name`, `clothing_insulation_schedule_name` e
`air_velocity_schedule_name` não podem ficar vazios. Não é uma linha de mudança; é tarefa
própria, se algum dia o PMV/PPD entrar no escopo. O ASHRAE 55 simples, que é o que o resumo
traz, **não** depende disso.

**Terceiro caso de dado morto neste repositório.** O dicionário em `SimulationDialog.tsx`
tinha `InteriorLighting` e `InteriorEquipment` grafados sem espaço, enquanto a API manda
`Interior Lighting` e `Interior Equipment`. As duas entradas nunca casaram, e ninguém notou
porque o fallback devolve o nome original — o defeito se apresenta como texto em inglês, que
parece "ainda não traduzido" e não "traduzido errado". Depois de `defaultOn` (T009) e da
lista literal de `answers.ts`, é padrão suficiente para desconfiar: **tabela de tradução sem
teste de cobertura apodrece em silêncio.** Por isso `rotulos.test.ts` percorre a fixture real
e exige chave para todo nome que ela contém, em vez de conferir uma lista escrita à mão.

**O rótulo em inglês sobreviveu à T008 porque o teste cobria a conta, não o texto.**
`usosFinaisEmKwh` tinha cinco testes, todos sobre conversão de unidade e filtragem — trocar
`uso.category` por `rotuloDeUsoFinal(uso.category)` não quebrou nenhum. Agora há asserção de
rótulo.

**A verificação da T007 está inteiramente fechada.** `StackedBarChart` recebeu dado não nulo
em três séries simultâneas, que era a última lacuna registrada na T010.

**O seletor de zona continua sem prova com dado real** (a execução disponível tem uma zona
só), e a `SimulationDialog` segue sem teste — o Vitest roda em `environment: 'node'` e a
tabela do diálogo é `.tsx`. O dicionário que ela usa, esse sim, está coberto.
