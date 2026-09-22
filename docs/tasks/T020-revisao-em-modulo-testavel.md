# T020: Tirar a revisão por IA do heredoc e pô-la em módulo testado

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T020-revisao-em-modulo-testavel`
- **Refs:** [`docs/backlog.md`](../backlog.md); fecha a dívida registrada na T018 e na T019

---

## 1. Objetivo

Três tarefas seguidas mexeram nas mesmas vinte linhas de Python dentro do
`ai-pr-review.yml`, cada uma com um roteiro de verificação descartável:

| | O que era | Como foi descoberto |
| --- | --- | --- |
| T018 | `json.loads` caía com qualquer sobra depois do objeto | reprovou o PR #11 |
| T019 | a tolerância nova aceitava objeto ilustrativo e **passava em silêncio** | revisão do PR #12 |
| — | "tem a chave" não bastava: exemplo com `findings` passaria igual | revisão do PR #13 |

O doc da T018 já dizia: *"se houver uma terceira, mover a função para `scripts/` com teste de
verdade deixa de ser preferência e vira o trabalho certo"*. Esta é a terceira. Em vez de um
quarto remendo na mesma heurística, o código sai do YAML.

O precedente é da própria casa: a T002 fez exatamente isto com o allowlist do proxy, que
virou `scripts/simulationRoutes.ts` com teste.

---

## 2. Escopo

### O que entra

- `scripts/aiReview/parse.ts` — lê a revisão da resposta do modelo. Puro.
- `scripts/aiReview/report.ts` — monta o Markdown do comentário. Puro.
- `scripts/aiReview/prompts.ts` — os prompts. Puros.
- `scripts/aiReview/run.ts` — o I/O: arquivos, chamada à API, `review.md`.
- 28 testes no Vitest, que rodam em `npm test` como qualquer outro.
- O workflow perde 154 linhas e passa a chamar `npx tsx scripts/aiReview/run.ts`.

### O que NÃO entra

- Mudar o que a revisão prioriza: `SYSTEM_PROMPT` foi transcrito sem alteração.
- Testar a chamada HTTP. É camada fina, e o próprio PR desta tarefa a exercita.

---

## 3. Decisões tomadas

- **TypeScript, e não Python num arquivo à parte.** `tsconfig.json` já inclui `scripts`, o
  Vitest já coleta `scripts/**/*.test.ts` e `tsx` já é dependência. Um módulo Python exigiria
  um segundo runner de teste no CI para render o mesmo serviço.

- **Ambiguidade reprova, em vez de ser resolvida por heurística.** É a resposta ao achado que
  a revisão do PR #13 levantou. Duas revisões plausíveis na mesma resposta não têm como ser
  distinguidas com confiança, e escolher uma seria adivinhar — adivinhar errado faz o portão
  obrigatório dar verde anunciando zero achado, que foi a regressão da T019. O caminho normal
  continua direto: a resposta inteira é um documento só, que é o que
  `response_format: json_object` produz; a varredura existe só para os desvios observados.

- **Tipo, e não presença de chave.** `findings` precisa ser lista e `summary` precisa ser
  texto. A T019 conferia só a presença, e um exemplo ilustrativo contendo `"findings"`
  passaria pelo mesmo buraco com outra forma.

- **O corte em cinco achados passou a ser dito.** A versão em Python cortava em silêncio: um
  relatório que mostra cinco de doze sem avisar deixa quem lê achando que viu tudo. Não era
  o objetivo da tarefa; apareceu porque escrever o teste obrigou a olhar o comportamento.

- **O log de falha descreve a forma, nunca o conteúdo.** `describeShape` devolve só como a
  resposta começa e quantos caracteres tem. Há teste afirmando que nenhum trecho da resposta
  reaparece ali — o log do CI deste repositório é público e a resposta deriva do diff.

- **`npm ci` só depois do preflight.** PR sem alteração de código relevante não paga
  instalação de dependências.

---

## 4. Alterações realizadas

- `scripts/aiReview/{parse,report,prompts,run}.ts`: novos.
- `scripts/aiReview/__tests__/{parse,report}.test.ts`: novos, 28 testes.
- `.github/workflows/ai-pr-review.yml`: de 297 para 143 linhas; ganha `setup-node` e
  `npm ci`, ambos condicionados ao preflight.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 272 testes (eram 239 na `main`; +33 nesta tarefa, 5 vindos da revisão do PR)
- [x] `npm run build`
- [x] YAML válido (`yaml.safe_load`).
- [x] `npx tsx scripts/aiReview/run.ts` sem chave falha limpo, com a anotação que o Actions
      reconhece.
- [x] **Os casos das três tarefas viraram teste de verdade**, e não roteiro descartável:
      objeto seguido de texto (o do PR #11), cerca de bloco em três variações, preâmbulo em
      prosa, chave literal na prosa, objeto ilustrativo sem as chaves (o da T019), objeto
      ilustrativo **com** as chaves (o do PR #13, que agora dá ambiguidade), `findings` com
      tipo errado, severidade desconhecida, elemento de `findings` que não é objeto, e chave
      dentro de string.
- [x] Teste afirmando que `describeShape` **não** repete trecho da resposta.
- [x] A chamada HTTP é exercitada pelo próprio PR desta tarefa.

---

## 5.1 Revisão do PR

Cinco achados. **Quatro aceitos**, um rejeitado por ser factualmente errado.

| Achado | Veredito |
| --- | --- |
| `{"summary": "ok", "findings": "texto"}` aceito, esvaziando `findings` em silêncio | **aceito** — o mais grave da rodada |
| a linha "os demais são de severidade menor" não tinha lastro, porque nada ordenava | **aceito** — agora ordena por gravidade e desempata por confiança |
| `resposta.text()` rejeitando mascararia o código HTTP | **aceito** — o status é lido antes de qualquer outro `await` |
| aspas escapadas dentro de string | **teste aceito**, premissa não: já funcionava, e agora há asserção |
| `describeShape` diria "objeto" para cerca com texto depois | **rejeitado** — ele roda sobre a resposta crua, não sobre a sem cerca; conferido, devolve "cerca de bloco" |

O primeiro é o que mais importa, e é a mesma família da regressão da T019: com uma chave
certa e a outra com o tipo errado, o objeto passava, `findings` virava lista vazia e o
relatório anunciava "nenhum defeito" com achados que o modelo tinha escrito. `pareceRevisao`
agora recusa **qualquer** chave do contrato com tipo errado, em vez de exigir que ao menos
uma esteja certa.

---

## 6. Observações / armadilhas para tarefas futuras

**A dívida cobrou três vezes antes de ser paga, e o custo cresceu a cada uma.** A T018 era um
conserto de dez minutos; a T019 consertou a regressão da T018; o achado do PR #13 teria
gerado uma T021 pela mesma via. O sinal de parar de remendar não foi o defeito em si, foi a
**repetição** — e ele estava escrito no doc da T018 antes de a T019 existir.

**Escrever o teste encontrou um defeito que ninguém tinha reportado.** O corte em cinco
achados era silencioso desde sempre. Nenhuma das três tarefas anteriores o viu, porque
nenhuma teve de descrever o comportamento esperado em voz alta. **É o argumento prático a
favor de mover código para onde ele possa ser testado**, separado do argumento de
corretude.

**Código de CI que só roda no CI falha no pior momento.** Enquanto o parser viveu no YAML,
cada defeito dele aparecia como um PR bloqueado, e não como um teste vermelho na máquina de
quem escreveu. Se algum outro workflow ganhar lógica não trivial, o lugar dela é `scripts/`.

**O `SYSTEM_PROMPT` agora é legível fora do YAML**, em `prompts.ts`. Ele define o que a
revisão prioriza — isolamento de `src/core/`, conformidade epJSON, superfícies
compartilhadas, `planWizardSync`, segredos — e isso é decisão de projeto, não detalhe de
transporte. Mudá-lo continua sendo mudança de comportamento do portão.
