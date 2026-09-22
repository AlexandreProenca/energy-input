# T009: Ligar o preset `conforto` por padrão e fechar a divergência de defaults

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T009-preset-conforto-padrao`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; [ADR-0001](../adr/0001-preset-de-conforto-ligado-por-padrao.md)

---

## 1. Objetivo

Os painéis de temperatura operativa (T010) e horas de desconforto (T011) dependem da série
de `Zone Operative Temperature`, que só existe se o modelo a tiver pedido **antes** de
simular. O preset que a pede vinha desligado, e quem descobrisse isso no painel teria de
rodar a execução de novo.

---

## 2. Escopo

### O que entra

- `conforto` vira `defaultOn: true`.
- `defaultAnswers()` passa a **derivar** o conjunto padrão de `defaultOn`.
- [ADR-0001](../adr/0001-preset-de-conforto-ligado-por-padrao.md).
- `src/generators/__tests__/outputsPadrao.test.ts`: 5 asserções.

### O que NÃO entra (deliberadamente postergado)

- Painéis que consomem a série — **T010** e **T011**.
- Tornar o preset obrigatório: ele continua desmarcável na etapa Resultados. A decisão é
  sobre o **padrão**.
- Migrar projetos salvos: o autosave guarda `outputs.selected` explicitamente, e mudar a
  escolha de alguém em disco seria pior que a armadilha que se está consertando.

---

## 3. Decisões tomadas

As duas decisões de rumo estão no [ADR-0001](../adr/0001-preset-de-conforto-ligado-por-padrao.md),
com as alternativas consideradas e os custos medidos. Em resumo:

- **Ligar o preset por padrão**, em vez de deixar a interface detectar a ausência e oferecer
  religar. Detectar só funciona **depois** de a execução terminar — numa anual, significa
  rodar duas vezes para ver o número que o produto anuncia como entrega principal.

- **Derivar o padrão de `defaultOn`**, e não só editar o JSON. Sem isso a correção seria
  ilusória: `defaultOn` era dado morto e a mudança não teria efeito nenhum.

---

## 4. Alterações realizadas

- `src/templates/outputs/outputs.json`: `conforto` com `defaultOn: true`.
- `src/generators/answers.ts`: `outputs.selected` derivado do catálogo.
- `docs/adr/0001-preset-de-conforto-ligado-por-padrao.md`: novo — o primeiro ADR do
  repositório.
- `src/generators/__tests__/outputsPadrao.test.ts`: novo, 5 testes.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 235 testes (eram 230; +5 nesta tarefa)
- [x] `npm run build`
- [x] `src/core/sync/__tests__/wizardSync.test.ts` continua passando: o assistente escreve
      objetos **novos**, e `planWizardSync` só acusa divergência em objeto que ele já possuía
      e o usuário alterou.
- [x] **Documento gerado conferido de fato**, e não só pelo teste: o padrão passou de
      `["resumo","cargas","conta"]` para `["resumo","conforto","cargas","conta"]`, e o epJSON
      agora traz `Zone Operative Temperature` e `Site Outdoor Air Drybulb Temperature` —
      exatamente as duas de que a T005 e a T010 precisam.
- [x] **Prova negativa:** devolvendo `defaultOn: false` ao JSON, dois testes reprovam.

---

## 6. Observações / armadilhas para tarefas futuras

**`defaultOn` era dado morto, e isso é o que torna esta tarefa não-trivial.** Um `grep` por
`defaultOn` em `src/` e `scripts/` só encontrava o próprio JSON e a declaração do tipo em
`src/templates/outputs/types.ts`. O conjunto padrão real era uma lista literal em
`answers.ts`, e as duas fontes coincidiam **por acaso**. Quem tentasse ligar o preset
editando só o JSON — o lugar óbvio — não mudaria nada, e o engano não deixaria rastro.

Agora o padrão deriva do catálogo, e há teste travando isso. **Vale o mesmo cuidado para
qualquer outro catálogo em `src/templates/`:** um campo que parece configuração e que
ninguém lê é pior que campo nenhum, porque convida à edição inútil.

**O custo da mudança é pequeno e foi medido, não estimado.** São quatro `Output:Variable`
horários — cerca de 4 × 8 760 × zonas linhas no `eplusout.sql`. Num modelo de quatro zonas,
~140 mil linhas, perto do que a execução já grava com o `Output:SQLite` do preset `resumo`,
que já estava ligado.

**Projetos salvos não mudam.** O autosave guarda `outputs.selected` explicitamente, então
sessão restaurada mantém o que tinha. Se algum dia for preciso migrar escolhas em disco, é
decisão à parte — e das que exigem ADR próprio.
