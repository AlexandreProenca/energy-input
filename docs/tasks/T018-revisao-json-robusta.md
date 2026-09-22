# T018: Revisão por IA no PR cai quando o modelo devolve JSON com sobra

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T018-revisao-json-robusta`
- **Refs:** [`docs/backlog.md`](../backlog.md)

---

## 1. Objetivo

`ai-pr-review.yml` é **check obrigatório**, e reprovava por formato da resposta do modelo, não
por conteúdo do PR. Como a saída é não determinística, o bloqueio era por sorte: reexecutar
às vezes resolvia — o que confirma a natureza do problema em vez de corrigi-lo.

Registrado depois do PR #2. Voltou a acontecer no **PR #11**, com a mesma assinatura, e
bloqueou a revisão da T011 — por isso saiu agora.

---

## 2. Escopo

### O que entra

- `extrair_json`, que lê o **primeiro** objeto da resposta e ignora o que vier depois.
- Tolerância a cerca de bloco (` ```json `) e a preâmbulo em prosa antes do objeto.
- A resposta recebida passa a ir para o log quando a extração falha.

### O que NÃO entra

- Reagir a `findings` malformado depois de o JSON ser lido: campo ausente já cai no
  `.get(...)` com padrão, e inventar validação de esquema aqui seria escopo novo.
- Trocar o modelo ou o `response_format`. O defeito é de leitura, não de geração.

---

## 3. Decisões tomadas

- **`raw_decode` em vez de `json.loads`.** `json.loads` exige que a string inteira seja um
  documento só; `raw_decode` lê o primeiro e informa onde terminou. O resto da resposta é
  conversa do modelo, não dado — descartá-lo é exatamente o comportamento desejado.

- **Começar na primeira `{`, e não no caractere 0.** Só `raw_decode` não bastaria: quando o
  modelo escreve um preâmbulo antes do objeto, ele falha logo no primeiro caractere. A busca
  pela chave de abertura cobre esse caso, que é tão comum quanto o da sobra.

- **Logar a resposta quando a extração falha.** Sem isso, diagnosticar o próximo formato
  inesperado exige reproduzir a chamada à mão — foi o que custou tempo nas duas vezes em que
  isso aconteceu.

- **Não afrouxar o portão.** A tentação era deixar o job passar quando não conseguisse ler a
  resposta. Um check obrigatório que passa quando não entendeu o resultado não é portão
  nenhum. Resposta ilegível continua reprovando — agora dizendo o que recebeu.

---

## 4. Alterações realizadas

- `.github/workflows/ai-pr-review.yml`: `extrair_json`, `import re`, log da resposta no erro.

---

## 5. Verificação e testes

O código vive dentro de um heredoc no YAML, então a verificação **extrai a função do próprio
arquivo** e a exercita — assim o que é testado é o que roda, e não uma cópia que pode
divergir.

- [x] YAML continua válido (`yaml.safe_load`).
- [x] Sete casos, todos passando: objeto limpo; **objeto seguido de texto** (o caso real);
      cerca de bloco; preâmbulo em prosa; cerca **e** texto depois; resposta sem objeto
      nenhum (reprova, como deve); JSON truncado (reprova, como deve).
- [x] **Prova negativa:** o `json.loads` antigo falha no caso real com
      `Extra data: line 3 column 1`, que é literalmente a mensagem do job reprovado no
      PR #11.
- [x] `npm run typecheck && npm test && npm run build` — nada de `src/` mudou, mas os portões
      rodam porque o CI os roda.

---

## 6. Observações / armadilhas para tarefas futuras

**Código dentro de workflow não tem teste, e é por isso que este defeito durou.** O heredoc
Python do `ai-pr-review.yml` não é exercitado por nada: não entra no `npm test`, não passa
pelo `tsc`, e só roda quando um PR está aberto — momento em que uma falha bloqueia em vez de
avisar. A verificação desta tarefa contorna isso extraindo a função do YAML, mas **é um
roteiro descartável, não um portão**. Se mais lógica for parar nesse workflow, o caminho certo
é movê-la para um script versionado em `scripts/` que o CI chame, aí sim testável como
qualquer outro.

**O sintoma reaparecer é o que fez a tarefa sair.** Ela estava registrada desde o PR #2 e
tinha sido adiada como incômodo raro. Voltou no PR #11 com a mesma assinatura. Defeito
intermitente em check obrigatório não fica mais barato esperando — ele cobra no pior momento,
que é quando outra tarefa depende da revisão.
