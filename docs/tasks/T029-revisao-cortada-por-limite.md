# T029: A revisão por IA reprovava quando a resposta era cortada pelo limite de tokens

- **Status:** Concluída
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T029-revisao-cortada-por-limite`
- **Refs:** [`docs/backlog.md`](../backlog.md); T020 (o módulo da revisão); PR #24 (onde apareceu)

---

## 1. Objetivo

No PR #24 a revisão por IA — check obrigatório — reprovou com
`nenhum objeto com 'findings' (lista) ou 'summary' (texto) na resposta`, e o log registrou só
`forma: objeto, 8714 caracteres`. É a primeira falha desse tipo desde a T020.

---

## 2. Escopo

### O que entra

- `scripts/aiReview/resposta.ts`: lê o texto **e** o `finish_reason`; resposta cortada tem
  diagnóstico próprio.
- `max_tokens` de 3 500 para 8 000.
- O prompt pede no máximo cinco achados e campos curtos.

### O que NÃO entra

- Afrouxar o portão. Resposta cortada continua reprovando — agora dizendo por quê.
- Tentar de novo automaticamente. Seria esconder o sintoma; a nova execução do PR, depois do
  merge, é manual.

---

## 3. Decisões tomadas

- **A causa provável é o limite de tokens**, e a primeira mudança é poder confirmar. Uma resposta
  que começa com `{`, tem ~8 700 caracteres e não contém nenhum objeto completo é o que um JSON
  cortado produz: o objeto externo não fecha, e os internos — os achados — não têm as chaves da
  revisão. Com 3 500 tokens de saída, ~8 700 caracteres em português é justamente o teto. **Não
  foi confirmado:** o `finish_reason` não era registrado. Agora é, e resposta cortada diz isso.

- **8 000 tokens, não o máximo.** O `deepseek-chat` aceita até 8 192 de saída; 8 000 deixa folga.

- **Pedir concisão protege o formato.** O relatório só mostra cinco achados, então pedir mais que
  isso gastava tokens em texto que ninguém via — e arriscava cortar o JSON.

- **O portão não afrouxa.** Um check obrigatório que passasse com a resposta cortada aprovaria
  sem ter lido a revisão — a regressão da T019, em outra forma.

---

## 4. Alterações realizadas

- `scripts/aiReview/resposta.ts` (novo), `scripts/aiReview/run.ts`, `scripts/aiReview/prompts.ts`.
- `scripts/aiReview/__tests__/resposta.test.ts` (novo, 4).

---

## 5. Verificação e testes

- [x] `npm run typecheck`, `npm test`, `npm run build`
- [x] `lerResposta` marca a resposta cortada, extrai o texto e tolera corpo incompleto.
- [x] `npx tsx scripts/aiReview/run.ts` sem chave continua falhando limpo.
- [x] A chamada real é exercitada por este PR, e a revisão do PR #24 é repetida depois do merge.

---

## 5.1 Revisão do PR

- **Aceito:** a checagem de corte estava dentro do `try` cujo `catch` reescreve a mensagem para
  "corpo que não é JSON". Funcionava porque `morrer` chama `process.exit`, que não lança — mas
  dependia disso. Saiu do `try`.
- **Aceito:** `finish_reason: "max_tokens"`, grafia de alguns gateways compatíveis, também conta
  como corte.
- **Refutado:** "8 000 pode exceder o teto do modelo e dar 400". A revisão deste mesmo PR rodou com
  `max_tokens: 8000`, e a API a aceitou.

---

## 6. Observações / armadilhas para tarefas futuras

**A mensagem genérica escondeu a causa.** "Formato inválido" era verdade, mas não dizia qual
formato nem por quê. Todo erro de uma integração externa deve registrar o que a outra ponta disse
sobre si mesma — aqui, o `finish_reason`.

**PR grande pede resposta longa.** Mais diff, mais achados, mais texto — e o limite de tokens é
fixo. É mais um motivo para manter os PRs pequenos, além dos que o AGENTS.md já dá.
