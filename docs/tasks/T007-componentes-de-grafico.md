# T007: Componentes de gráfico SVG reutilizáveis

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T007-componentes-de-grafico`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; T004 (agregação), T006 (casca)

---

## 1. Objetivo

Os quatro desenhos de que os painéis precisam, sem dependência nova, seguindo o precedente de
`src/features/wizard/illustrations.tsx`. Eles recebem dados **já agregados** pela T004 e não
calculam nada — toda a aritmética que decide o que aparece na tela fica em `src/core/`, onde
o Vitest alcança.

---

## 2. Escopo

### O que entra

- `src/core/results/plot.ts`: `linearScale`, `niceTicks`, `polylinePath`, `bandPath`,
  `carpetCells`, `divergingColor` — 17 asserções.
- `src/features/results/charts/`: `ChartFrame`, `BarChart`, `LineChart`, `StackedBarChart`,
  `CarpetPlot`.
- `usosFinaisEmKwh` em `estado.ts`, com 3 asserções, e o primeiro gráfico ligado ao resumo
  real na casca.

### O que NÃO entra (deliberadamente postergado)

- Painéis completos de consumo, temperatura e desconforto — **T008**, **T010**, **T011**.
- Consulta de série temporal na interface: o `LineChart` e o `CarpetPlot` existem e estão
  testados na geometria, mas só recebem dado real na T010.

---

## 3. Decisões tomadas

- **A geometria mora em `src/core/results/plot.ts`, não nos componentes.** O Vitest roda em
  `environment: 'node'` sem jsdom; lógica dentro do `.tsx` não tem como ser exercitada. E é
  ali que moram os erros que de fato aparecem na tela: divisão por zero em domínio
  degenerado, `NaN` virando `"M NaN NaN"` no atributo `d`, marcação de eixo com dezessete
  casas decimais.

- **Todo gráfico passa pelo `ChartFrame`,** que exige `label`. Um `<svg>` sem `role` e
  `aria-label` é invisível para leitor de tela, e o PRD §5.2 compromete acessibilidade.
  Tornar o nome acessível um parâmetro obrigatório é mais barato que lembrar de pô-lo.

- **`LineChart` desenha a banda mín/máx **e** a média.** A reamostragem da T004 preserva os
  extremos de cada balde justamente para o pico sobreviver à redução de 8 760 pontos; uma
  linha só da média jogaria isso fora.

- **`CarpetPlot` em `<canvas>`, com tabela `sr-only` ao lado.** Um ano horário são 8 760
  células — o `WeeklyHeatmap` do assistente desenha 168 e já é o limite confortável em SVG.
  Mas canvas é invisível para leitor de tela, então a alternativa textual não é opcional.

- **Barra começa em zero; linha pode ter base recortada.** Barra é comparação de magnitude, e
  cortar a base exagera diferença pequena. A linha ganha 5% de folga para não encostar na
  borda e parecer cortada.

- **Série inteiramente nula some da pilha e da legenda.** O motor devolve os 14 recursos
  sempre, mesmo zerados: sem filtrar, a legenda teria dez entradas invisíveis.

- **Não abrir ADR.** A decisão de SVG próprio, sem biblioteca, já está registrada no backlog
  (AGENTS.md §4).

---

## 4. Alterações realizadas

- `src/core/results/plot.ts` e `__tests__/plot.test.ts`: novos.
- `src/features/results/charts/{ChartFrame,BarChart,LineChart,StackedBarChart,CarpetPlot}.tsx`:
  novos.
- `src/features/results/estado.ts`: ganha `usosFinaisEmKwh`; `__tests__/estado.test.ts`
  ganha 3 asserções.
- `src/features/results/ResultsShell.tsx`: primeiro gráfico ligado ao resumo real.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 215 testes (eram 191; +24 nesta tarefa, 4 deles vindos da revisão do PR)
- [x] `npm run build`
- [x] **No navegador, contra o serviço real:** o `BarChart` desenha o consumo por uso final
      da execução `sim_01M2NEQ…` — **23.072 kWh em iluminação externa**, com eixo em marcações
      redondas, unidade e nome acessível no `<svg>`.

**Limite honesto desta verificação:** só o `BarChart` recebeu dado real na tela. O
`LineChart`, o `StackedBarChart` e o `CarpetPlot` dependem de série temporal, que só chega à
interface na T010 — até lá, a garantia deles é a geometria pura, com as armadilhas cobertas
(caminho com `NaN`, domínio degenerado, linha da hora 24 no carpete, cor fechada nas bordas).

---

## 6. Observações / armadilhas para tarefas futuras

**A moldura e o filho não podem calcular a mesma escala em separado.** O `ChartFrame`
desenha as linhas de grade com a sua escala, e o `BarChart` desenhava as barras com uma
escala própria a partir dos mesmos dados. Batiam quase sempre — e divergiam no caso de borda,
com todos os valores iguais: a grade usava `min + 1` e a barra usava `max`. Agora a moldura
**passa a escala** para o filho, e as duas concordam por construção. Conferido numericamente
no navegador: a base da barra cai em `y = 196`, exatamente sobre a linha de grade do zero.

**Saldo negativo em uso final é dado, não ruído.** O filtro era `valor > 0` e virou
`!== 0`: geração no local pode deixar um uso final com saldo negativo, e esconder isso
apagaria justamente o resultado mais interessante do projeto. Zerado continua fora, porque o
motor devolve os 14 recursos sempre.

**Multiplicar por inteiro não escapa do ponto flutuante.** A primeira versão de `niceTicks`
usava múltiplos inteiros do passo para não *acumular* erro — e ainda assim `3 × 0,1` é
`0,30000000000000004`, que iria inteiro para o rótulo do eixo. Agora cada marcação é
arredondada à precisão do próprio passo. Vale para qualquer eixo com passo fracionário.

**A única execução bem-sucedida disponível tem um único uso final com consumo.** São
23.072 kWh em `Exterior Lighting`; os outros treze recursos vêm zerados, e a água vem em
`m3`. Isso é bom para exercitar o filtro, e ruim para conferir o visual de várias barras —
com uma só, `faixa` é a área inteira e a barra virava um bloco. Entrou um teto de largura de
72 px. **A T008 deve conferir o caso de muitas barras quando houver execução com mais usos.**

**O `summary` não sobrevive ao HMR.** Ele não é persistido, por desenho (a credencial e os
resultados ficam só em memória). Durante a verificação, uma recarga a quente apagou o gráfico
e pareceu regressão — era só o estado. Readotar a execução pelo campo restaura.

**`polylinePath` quebra a linha em ponto não finito, em vez de descartá-lo.** Emendar por
cima de um buraco desenharia um segmento que os dados não sustentam. Quem usar o componente
com série que tem horas sem dado verá a lacuna, que é o comportamento certo — e a T004 já
informa `dropped` para o painel dizer quantas foram.
