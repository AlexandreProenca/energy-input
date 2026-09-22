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

- **Varrer todas as chaves de abertura, não só a primeira.** Só `raw_decode` não bastaria:
  com preâmbulo antes do objeto, ele falha no caractere 0. A primeira versão pegava a
  primeira `{`, e a revisão do PR apontou o furo — prosa do tipo `use {chaves} assim` faria
  essa primeira chave apontar para lixo. Agora tenta cada candidata até uma decodificar.

- **Exigir `dict`.** Resposta como `[1,2,3]` decodifica sem erro, e o `.get("findings")`
  seguinte levantaria `AttributeError`: o job reprovaria — o que é correto — mas pela razão
  errada e com mensagem que não ajuda a diagnosticar. Veio da revisão do PR.

- **Logar só o começo da resposta, e o tamanho.** Sem log nenhum, diagnosticar o próximo
  formato inesperado exige reproduzir a chamada à mão — foi o que custou tempo nas duas
  ocorrências anteriores. Mas a primeira versão despejava 4 000 caracteres, e a revisão do PR
  lembrou que **o log de CI deste repositório é público** e que a resposta deriva do diff.
  300 caracteres e o tamanho identificam um problema de formato sem expor o corpo da
  revisão.

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
- [x] **Catorze casos, todos passando.** Leem: objeto limpo; **objeto seguido de texto** (o
      caso real); cerca de bloco, com espaço antes da linguagem e sem quebra de linha;
      preâmbulo em prosa; cerca **e** texto depois; prosa com `{chave}` literal antes do
      objeto; chave solta que não decodifica. Reprovam, como devem, com `ValueError`
      explícito: array, string e número no lugar do objeto; resposta sem objeto; JSON
      truncado.
- [x] **Segunda prova negativa**, do achado da revisão: sem a checagem de `dict`, `[1,2,3]`
      decodifica e o `.get()` levanta `AttributeError` — falha certa pelo motivo errado.
- [x] **Prova negativa:** o `json.loads` antigo falha no caso real com
      `Extra data: line 3 column 1`, que é literalmente a mensagem do job reprovado no
      PR #11.
- [x] `npm run typecheck && npm test && npm run build` — nada de `src/` mudou, mas os portões
      rodam porque o CI os roda.

---

## 5.1 Revisão do PR

Os três achados foram aceitos e implementados no mesmo commit:

| Achado | O que mudou |
| --- | --- |
| `extrair_json` podia devolver não-objeto | exige `dict`, com `ValueError` explícito |
| primeira `{` podia ser de prosa | varre todas as candidatas |
| log podia expor conteúdo do diff | 300 caracteres e o tamanho, não 4 000 |

O segundo achado é o que mais importa: a primeira versão **parecia** cobrir preâmbulo em
prosa, e cobria — até a prosa conter uma chave.

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
