# T026: O assistente em sete páginas

- **Status:** Concluída
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T026-assistente-em-sete-paginas`
- **Refs:** [`docs/backlog.md`](../backlog.md); pedido do dono do produto — "um fluxo mais fluido,
  com menos etapas"

---

## 1. Objetivo

Unir as etapas do assistente em pares: **projeto e clima**, **materiais e janelas**, **uso e
climatização**. O assistente passa de 10 para 7 páginas.

---

## 2. Escopo

### O que entra

- Uma camada de **páginas** sobre as etapas: `WIZARD_PAGES`, `PAGE_STEPS` e `pageOf` em
  `src/generators/answers.ts`, e `PAGE_META` (títulos e perguntas) em
  `src/features/wizard/steps.ts`.
- `WizardShell` navega por página e renderiza as etapas de cada uma em sequência, com o título
  da etapa como subtítulo.
- `goToStep` e a restauração do autosave levam qualquer etapa à página que a mostra.
- README e PRD §4.1: sete páginas.

### O que NÃO entra (deliberadamente postergado)

- **Mudar as respostas.** Continuam separadas por etapa: é o que os geradores consomem e a chave
  dos fragmentos de `compose.ts`. Unir as respostas mexeria no `planWizardSync` por nada.
- A chave da API por variável de ambiente e o acompanhamento da simulação, pedidos junto: são
  a T027 e a T028.

---

## 3. Decisões tomadas

- **Agrupar a navegação, não as respostas.** `WIZARD_STEPS` segue como está; as páginas são uma
  camada por cima. Cada página tem o id da **primeira** etapa que mostra, então todo id de página
  também é um id de etapa válido — o `WizardShell` e o código que já chamava `goToStep` não
  precisaram de tradução.

- **`goToStep` normaliza para a página.** Chamadas existentes, como o "Editar Janelas" da
  Revisão, abrem "Materiais e janelas" sem que a Revisão precisasse mudar.

- **A sessão salva é normalizada ao restaurar.** Quem parou em "Clima", "Janelas" ou
  "Climatização" — que deixaram de ser página — volta na página que as mostra. Sem isso, o
  assistente abriria numa página que nenhum componente desenha. Valor desconhecido (autosave de
  versão futura ou corrompido) volta ao começo.

- **Página unida mostra cada etapa com o próprio título.** "Materiais" e "Janelas" continuam
  reconhecíveis dentro de "Materiais e janelas", e a Revisão continua citando as etapas pelo
  nome de sempre.

- **Rótulos curtos:** "Projeto", "Envoltória" e "Uso", para a barra de etapas em tela estreita. Em
  tela larga aparece o título inteiro. "Envoltória" é o termo da NBR 15575 para paredes, coberturas
  e aberturas juntas.

---

## 4. Alterações realizadas

- `src/generators/answers.ts`: `WIZARD_PAGES`, `PAGE_STEPS`, `pageOf`.
- `src/features/wizard/steps.ts`: `PAGE_META`.
- `src/features/wizard/WizardShell.tsx`: navegação e corpo por página.
- `src/store/uiStore.ts`: `wizardStep` é página; `goToStep` normaliza.
- `src/store/persistence.ts`: restauração normalizada.
- `README.md`, `docs/PRD.md`: sete páginas.
- Testes: `src/generators/__tests__/paginas.test.ts` (novo, 5), `src/features/wizard/__tests__/pageMeta.test.ts`
  (novo, 4) e `persistence.test.ts` (+3).

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 357 testes (eram 345; +12 nesta tarefa, 4 da revisão do PR)
- [x] `npm run build`
- [x] **Toda etapa aparece em exatamente uma página, na ordem original** — o teste compara a
      concatenação das páginas com `WIZARD_STEPS`.
- [x] **Prova negativa:** sem a normalização na restauração, dois testes de persistência reprovam.
- [x] **No navegador:** a barra mostra 7 páginas; "Projeto e clima", "Materiais e janelas" e "Uso
      e climatização" mostram as duas etapas cada, com os títulos; "Editar Janelas", na Revisão,
      abre a página 4.

---

## 5.1 Revisão do PR

Cinco achados. **Um aceito**, quatro declinados:

| Achado | Veredito |
|---|---|
| `PAGE_META` usa `!` no `find` sem garantia de que toda página tem metadados | **aceito** — o `!` cala o tipo e o erro só apareceria na tela. `pageMeta.test.ts` confere que toda página tem título, pergunta, ícone e etapas, e que toda etapa tem título |
| "Etapa 4 de 7" conta páginas, e README/PRD "ainda falam em 10 etapas" | **declinado** — para quem usa, a página é a etapa, e o pedido foi "menos etapas". README e PRD foram atualizados neste mesmo PR |
| O visto verde marca a página inteira quando só uma das etapas foi visitada | **declinado** — o visto indica visitada, não validada; quem viu Clima viu parte da página 1 |
| `find` dentro do render | **declinado** — sete páginas; não há custo mensurável |
| `pageOf` volta ao começo em silêncio | **declinado** — o teste de "toda etapa em exatamente uma página" reprova antes de uma etapa ficar sem página |

---

## 6. Observações / armadilhas para tarefas futuras

**O id da página é o da primeira etapa, e isso é deliberado.** Se alguém reordenar as etapas de uma
página, precisa trocar também o id da página — o teste "têm o id da primeira etapa que mostram"
reprova antes.

**Etapa nova precisa entrar numa página.** O teste que compara a concatenação das páginas com
`WIZARD_STEPS` reprova quando alguém acrescenta uma etapa e esquece a navegação.
