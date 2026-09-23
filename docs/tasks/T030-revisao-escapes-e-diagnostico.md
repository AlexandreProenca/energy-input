# T030: Revisão por IA — escape inválido e diagnóstico que distingue as causas

- **Status:** Concluída
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T030-revisao-escapes-e-diagnostico`
- **Refs:** [`docs/backlog.md`](../backlog.md); T029 (hipótese do corte por limite de tokens); PR #24

---

## 1. Objetivo

Depois da T029, a revisão do PR #24 reprovou **de novo** com o mesmo erro:

> Resposta do modelo em formato inválido: nenhum objeto com 'findings' (lista) ou 'summary'
> (texto) na resposta — forma: objeto, 6240 caracteres

Sem o diagnóstico de corte que a T029 acrescentou. **A hipótese da T029 não explica esta falha:**
a resposta terminou normalmente, com 6 240 caracteres, bem abaixo do novo limite. O doc da T029 é
histórico e continua como está; a correção fica registrada aqui e no backlog.

Esta tarefa faz duas coisas: dá ao log o que falta para distinguir as causas sem expor conteúdo,
e trata a causa mais provável que sobrou.

---

## 2. Escopo

### O que entra

- `diagnoseResponse` em `scripts/aiReview/parse.ts`: forma e tamanho (como antes) mais se o texto
  decodifica como JSON, o **tipo** e a **posição** do erro de sintaxe, se decodificaria depois do
  reparo de escapes e, quando decodifica, os **nomes** das chaves de topo e seus tipos.
- `repararEscapes`: dobra a barra invertida que não começa um escape válido de JSON. Só é usada
  quando a resposta não decodifica como veio.
- `run.ts` usa o diagnóstico novo no caminho de formato inválido.

### O que NÃO entra (deliberadamente postergado)

- **Afrouxar o portão.** Resposta que continua ilegível depois do reparo segue reprovando.
- **Registrar a resposta crua** em artefato do CI. O log e os artefatos deste repositório são
  públicos, e a resposta deriva do diff.

---

## 3. Decisões tomadas

- **A causa provável agora é escape inválido.** Só o PR #24 falha, e é o único que cita regex do
  nginx (`"~^https?://([^|/]+)\|\1$"`). Um modelo que copia isso para a string da evidência sem
  dobrar a barra produz `\|` e `\1`, que o JSON não aceita. O documento inteiro deixa de
  decodificar; a varredura de candidatos só acha os objetos internos, os achados, e nenhum deles
  tem as chaves da revisão — exatamente a mensagem vista. **Não está confirmado**: o diagnóstico
  novo existe para confirmar ou desmentir na próxima execução, em vez de adivinhar de novo.

- **O reparo é certo seja qual for a causa.** Barra antes de caractere que não forma escape não
  tem outro significado possível além da barra literal, que é o que o modelo quis escrever.

- **Tokenizador, não regex.** Em `\\1` a primeira barra escapa a segunda, e a segunda não pode ser
  tratada como início de escape. Uma regex que olha só o caractere seguinte à barra dobraria a
  segunda barra e estragaria um texto válido.

- **Só como fallback.** Resposta que já decodifica passa intacta: aplicar o reparo sempre
  dependeria de ele estar certo em todo texto válido, e não há ganho nisso.

- **O diagnóstico não repete conteúdo.** A mensagem do V8 para token inesperado cita um trecho do
  texto (`Unexpected token 'x', "…" is not valid JSON`); o trecho depois de `, "` sai. Nome de
  chave é esquema, não conteúdo, mas ainda assim um nome fora de `[A-Za-z_]{1,40}` aparece como
  `<chave>`.

---

## 4. Alterações realizadas

- `scripts/aiReview/parse.ts`: `repararEscapes`, `diagnoseResponse`; `parseReview` repara quando
  a resposta não decodifica.
- `scripts/aiReview/run.ts`: o diagnóstico novo no caminho de formato inválido.
- `scripts/aiReview/__tests__/parse.test.ts`: +8 testes.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 370 testes (eram 362; +8 nesta tarefa)
- [x] `npm run build`
- [x] **A resposta com a regex citada é lida**, com a evidência igual ao texto que o modelo quis
      escrever, também com prosa em volta.
- [x] **Escapes válidos ficam intactos**, inclusive `\\1`, e JSON válido com barra dobrada não é
      reparado de novo.
- [x] **Prova negativa:** sem o reparo, os dois testes de leitura reprovam.
- [x] **O diagnóstico não vaza:** quatro respostas com um marcador no conteúdo, em chave, valor
      sem aspas, prosa e string aberta; o marcador não aparece.
- [x] **Em Node 18, 20 e 22**, porque a mensagem de erro do `JSON.parse` muda entre versões (ver §6).
- [ ] **Confirmação da causa no PR #24:** depende da próxima execução da revisão, com esta tarefa
      na `main`.

---

## 6. Observações / armadilhas para tarefas futuras

**Um diagnóstico que não distingue as causas convida a adivinhar.** "forma: objeto, 8714
caracteres" era compatível com corte e com escape inválido, e a T029 escolheu a mais provável sem
poder confirmar — registrou isso, mas a próxima falha só desmentiu, sem apontar a causa. O log agora
separa decodifica/não decodifica, onde o erro ocorre e se o reparo resolveria.

**A mensagem de erro do `JSON.parse` muda com a versão do Node, e o teste de vazamento pegou
isso.** O primeiro corte procurava `, "` — a forma do Node 18 que rodou localmente. O CI roda Node
20, que cita o trecho como `, ..."…"`, e o marcador vazou no log do teste. O corte passou a ser no
primeiro apóstrofo ou aspa, conferido nas três versões. No Node 20, "Unexpected token" nem traz a
posição; "Bad escaped character", o caso desta tarefa, traz.
