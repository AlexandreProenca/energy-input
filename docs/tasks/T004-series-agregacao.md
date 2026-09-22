# T004: `core/results/series.ts` — agregação, reamostragem e conversão

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T004-series-agregacao`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; T001 (fixtures), T003 (tipos)

---

## 1. Objetivo

A aritmética sobre a qual todo gráfico do épico se apoia: transformar a série crua da API em
baldes diários e mensais, reduzi-la ao que cabe na tela sem perder os extremos, e converter
unidades sem mentir. Tudo puro, para ser testado no terminal — os componentes de gráfico
(T007) recebem o resultado pronto e não calculam nada.

---

## 2. Escopo

### O que entra

- `src/core/results/units.ts`: `toKwh`, `isEnergyUnit`, `normalizeUnit`, `formatUnit`.
- `src/core/results/series.ts`: `normalizeSeries`, `dayOfYear`, `defaultAggregation`,
  `aggregateDaily`, `aggregateMonthly`, `downsampleEnvelope`.
- `src/core/results/__tests__/series.test.ts`: 21 asserções.

### O que NÃO entra (deliberadamente postergado)

- Horas de desconforto e faixa adaptativa — **T005**.
- Escalas, ticks e geração de `path` SVG — **T007**, junto dos componentes.
- Filtro por horas ocupadas: exigiria `Zone People Occupant Count` no preset ou parsear
  `Schedule:Compact` de volta do documento. Fica para quando houver demanda.

---

## 3. Decisões tomadas

- **A posição no calendário vem de `month`/`day`, nunca do `timestamp`.** A hora 24 é o fim
  do intervalo e pertence ao dia anterior, enquanto seu `timestamp` UTC já está no dia
  seguinte. Derivar o dia do carimbo deslocaria a série inteira em um dia.

- **`leap` é detectado pela presença de 29 de fevereiro, não pelo ano do carimbo.** O ano vem
  do arquivo climático — 2013 nas fixtures — e não corresponde ao calendário da execução.

- **`defaultAggregation` deduz do que o serviço diz da série, não do nome da variável.**
  Medidor ou agregação `Sum` do motor somam; o resto faz média. Adivinhar pelo nome erraria
  em `Zone Ideal Loads Supply Air Total Cooling Energy` — que não tem "Temperature" no nome
  e é energia — e em qualquer variável nova.

- **Balde sem ponto não existe, em vez de valer zero.** Um dia sem medição não é um dia de
  consumo nulo. Desenhá-lo como zero mentiria; omiti-lo deixa o gráfico mostrar a lacuna.

- **Reamostragem por envelope mín/máx, não decimação nem LTTB.** O pico anual é o número que
  um engenheiro procura, e uma série de 8 760 pontos reduzida a 800 por amostragem o perde
  com alta probabilidade. O gráfico desenha a banda mín/máx e a linha da média, então o
  extremo sobrevive à redução. LTTB produz curva mais bonita e **não garante o extremo**,
  que é justamente o requisito.

- **`toKwh` devolve `null` para unidade que não é de energia.** `Summary.end_uses` mistura
  `GJ` e `m3` na mesma lista, sempre com os 14 recursos. Converter cego somaria metros
  cúbicos com quilowatt-hora.

- **A tabela de conversão guarda joules por unidade, não o fator direto para kWh.** Ver §6.

- **Não abrir ADR.** É implementação do que o backlog já decidiu (AGENTS.md §4).

---

## 4. Alterações realizadas

- `src/core/results/units.ts`: novo.
- `src/core/results/series.ts`: novo.
- `src/core/results/__tests__/series.test.ts`: novo, 21 testes.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 155 testes (eram 134; +21 nesta tarefa)
- [x] `npm run build`
- [x] Contraprovas exigidas pelo AGENTS.md §5, cada uma escrita para falhar sob a
      implementação ingênua:
      - a decimação de 1 a cada 10 **perde** o pico que o envelope preserva;
      - a soma dos meses bate com a soma dos pontos (deriva de borda de balde);
      - todo ponto entra em exatamente um balde (8 760 conferidos);
      - a hora 24 não cria 25º balde nem vaza para o dia seguinte;
      - `dayOfYear` só desloca **depois** de fevereiro em ano bissexto.

---

## 6. Observações / armadilhas para tarefas futuras

**Multiplicar por recíproco perde precisão, e o teste pegou.** A primeira versão guardava o
fator direto para kWh (`1 / 3.600.000`), e `toKwh(3_600_000, 'J')` devolvia
`0,9999999999999999` em vez de 1. A tabela passou a guardar **joules por unidade**, com uma
única divisão no fim: `3,6e6 × 1 / 3,6e6` é exatamente 1. Qualquer tabela de conversão nova
deve seguir o mesmo formato.

**`normalizeSeries` devolve `dropped`, e a interface precisa usá-lo.** O contrato declara
todo campo do ponto como anulável e `value` realmente vem nulo quando o motor não registrou
a hora. Somar como zero afundaria a média; descartar em silêncio faria o gráfico mentir por
omissão. O painel deve dizer "N horas sem dado".

**`count` por balde distingue dia cheio de dia parcial.** Um dia com 6 horas medidas e outro
com 24 têm médias comparáveis e confiabilidades diferentes — a T007 pode usar isso para
esmaecer o trecho parcial em vez de desenhá-lo igual.

**O calendário dos testes sintéticos usa meses de 31 dias.** É suficiente para exercitar os
baldes e mantém o gerador legível; não confunda com o calendário real, que `dayOfYear`
trata corretamente e tem teste próprio nos limites de mês.
