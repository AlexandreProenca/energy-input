# T005: `core/results/comfort.ts` — horas de desconforto

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T005-horas-de-desconforto`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; T001 (fixtures), T004 (agregação)

---

## 1. Objetivo

"Horas de desconforto" é um dos três números que o PRD §9 pede no painel. Esta tarefa decide
**de onde ele sai** e implementa o cálculo — puro, testável, e sem emitir veredito de
conformidade.

---

## 2. Escopo

### O que entra

- `hoursOutsideBand` — horas fora da faixa, **frio e quente separados**, com classificação
  por hora para o carpete recolorir.
- `adaptiveBand`, `runningMeanOutdoor`, `adaptiveDiscomfort` — modelo adaptativo da
  ASHRAE 55 / EN 16798, com queda para a faixa fixa onde ele não vale.
- `summaryComfortHours` — os três indicadores do resumo permanente, organizados.
- `src/core/results/__tests__/comfort.test.ts`: 23 asserções.

### O que NÃO entra (deliberadamente postergado)

- **Filtro por horas ocupadas.** Exigiria `Zone People Occupant Count` no preset ou parsear
  `Schedule:Compact` de volta do documento — e o segundo fica errado depois de uma edição no
  Modo Especialista. A v1 calcula sobre as 8 760 h e o painel precisa rotular assim.
- **PMV/PPD (Fanger).** Precisaria de temperatura radiante média, velocidade do ar, vestimenta
  e metabolismo — nada disso está no preset nem no documento.
- **Veredito NBR 15575.** Indicador informativo, não verificação de conformidade.
- Rótulos pt-BR dos indicadores — **T011**, junto do painel.

---

## 3. Decisões tomadas

- **O indicador principal é calculado da série, não lido do resumo.** `hvac.ts` escreve
  `NoLimit` nos dois limites do `IdealLoadsAirSystem`, então
  `occupied_heating_setpoint_not_met` e `occupied_cooling_setpoint_not_met` ficam
  estruturalmente perto de zero — **0 h nas duas execuções reais observadas**. Eles medem
  controle e dimensionamento, não conforto do ocupante. Pôr um deles como número de destaque
  do painel mostraria zero para sempre.

- **Frio e quente contados em separado.** Um agregado único esconde a direção da falha, que é
  justamente o que a decisão de projeto precisa: 800 horas quentes pedem sombreamento e
  ventilação; 800 frias pedem isolamento e ganho solar. São respostas opostas.

- **A faixa adaptativa devolve `null` fora do domínio de validade (10 a 33,5 °C).**
  Extrapolar produziria uma faixa com aparência de resultado e sem lastro: a 5 °C de média
  externa o centro cairia para 19,4 °C, declarando confortável o que ninguém acha. O chamador
  cai para a faixa fixa — e `fallbackDays` conta em quantos dias isso aconteceu, porque uma
  faixa que troca de critério no meio do ano sem avisar é um gráfico que mente.

- **`summaryComfortHours` distingue "não reportado" de "zero horas".** Campo ausente vira
  `null`, não zero: são afirmações diferentes, e só a segunda pode ir para a tela como
  número. Valor que não venha em horas também vira `null` — aceitar cegamente poria um valor
  em graus num indicador rotulado "horas".

- **Não abrir ADR.** O backlog já registrou a decisão de fonte depois da T001 (AGENTS.md §4).

---

## 4. Alterações realizadas

- `src/core/results/comfort.ts`: novo.
- `src/core/results/__tests__/comfort.test.ts`: novo, 23 testes.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 182 testes (eram 159; +23 nesta tarefa, 3 deles vindos da revisão do PR)
- [x] `npm run build`
- [x] Contraprovas: série inteiramente acima não gera hora fria (pegaria `cold`/`hot`
      trocados); os limites da faixa contam como confortáveis, não como desconforto; a faixa
      adaptativa vale **exatamente** nas bordas do domínio e é nula um passo fora; a mesma
      temperatura interna muda de veredito conforme o clima externo.

---

## 6. Observações / armadilhas para tarefas futuras

**Dois testes meus estavam errados, e o código estava certo — vale registrar os dois.**

O primeiro comparava `runningMeanOutdoor([30,10,10,10])` com `([10,30,30,30])` esperando que
o primeiro fosse maior, "porque o dia recente pesa mais". Pesa — individualmente. Mas com
`alpha = 0,8` os três dias anteriores somam peso 1,952 contra 1,0 do mais recente, então três
dias quentes vencem um. O teste media **magnitude**, não recência. A versão correta inverte a
ordem do **mesmo** conjunto (`[30,10]` contra `[10,30]`), e há um segundo teste fixando
explicitamente que um dia recente não supera sozinho vários anteriores contrários.

O segundo esperava zero horas quentes num verão de 30 °C com interna a 27 °C. Mas o
**primeiro dia da série não tem histórico** e cai na faixa fixa (18–26), onde 27 °C é quente.
São 24 h quentes, não 0. O teste agora afirma isso e o `fallbackDays: 1` junto — o
comportamento é correto e precisa ficar visível.

**As duas séries precisam compartilhar o mesmo calendário.** `normalizeSeries` detecta
bissexto por série, e bastava a externa não conter 29 de fevereiro — por recorte ou buraco de
medição — para os índices divergirem de 1º de março em diante: a faixa de um dia seria
aplicada ao dia anterior pelo resto do ano. `adaptiveDiscomfort` agora usa
`indoor.leap || outdoor.leap` nas duas. Veio da revisão do PR, com prova negativa: o teste
reprova sob o código anterior.

**`fallbackDays` conta pelos dias da série interna.** Antes era contado percorrendo a
externa, então dias internos que ela nem cobre não apareciam — com interna de 10 dias e
externa de 3, o painel anunciaria "1 dia na faixa fixa" para 8 dias que a usaram.

**Dia sem dado na janela entra como `NaN`, não é removido.** Compactar a lista promove os
dias anteriores a pesos que não são deles: um buraco de um dia faria o de anteontem pesar
como o de ontem. Com a posição preservada, `[30, NaN, 10]` dá 22,195; compactando daria
21,111.

**A T011 tem de mostrar `fallbackDays` e as horas sem dado.** O painel que exibir só o total
de horas de desconforto estará escondendo duas coisas: quantos dias usaram um critério
diferente do anunciado, e quantas horas não foram medidas. `normalizeSeries` devolve
`dropped` e `adaptiveDiscomfort` devolve `fallbackDays` exatamente para isso.

**`simple_ashrae_55_not_comfortable` ainda não foi visto vindo de um modelo deste app.** Ele
deu 332,5 h numa execução real de **outro** modelo, e 0 h na outra. Depende de os objetos
`People` carregarem modelo de conforto. Quando a execução voltar (T016), confirmar: se os
modelos daqui produzem o campo, ele é o fallback natural para quando a série expirar (410);
se não produzem, o cálculo sobre a série é a única fonte e o painel precisa dizer que não há
fallback.

**A janela adaptativa usa peso geométrico `alpha^i` normalizado, não a tabela de sete pesos
da EN 16798.** As duas formas constam do padrão; a geométrica funciona para qualquer janela e
é o que `runningMeanOutdoor` documenta. Trocar por uma tabela fixa mudaria números — se
alguém o fizer, os testes de ordem continuam válidos, mas os valores absolutos mudam.
