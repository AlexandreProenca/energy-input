# T019: A revisão por IA podia passar em silêncio sem ter lido a revisão

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T019-revisao-objeto-certo`
- **Refs:** [`docs/backlog.md`](../backlog.md); corrige regressão introduzida na T018

---

## 1. Objetivo

Consertar uma **regressão que a T018 introduziu** e que a revisão do próprio PR #12 apontou
depois do merge.

A T018 fez `extrair_json` varrer todas as chaves de abertura e aceitar o primeiro `dict`.
Quando o modelo ilustra o formato antes de dar a revisão — `Por exemplo, um achado tem o
formato {"severity": "high"}. Segue a revisão: {…}` — o objeto **ilustrativo** é aceito.
`findings` vem vazio, `summary` vem vazio, e o job **passa anunciando que não há achados**.

Isso é pior que o defeito original. O defeito da T018 era barulhento: o job reprovava e
alguém ia olhar. Este é silencioso — o portão obrigatório dá verde sem ter revisado nada.

---

## 2. Escopo

### O que entra

- `extrair_json` passa a exigir que o objeto **pareça a revisão**: `dict` com `findings` ou
  `summary`.
- O log de falha passa a descrever a **forma** da resposta, não o conteúdo.

### O que NÃO entra

- Validar o esquema de cada achado: campo ausente já cai no `.get(...)` com padrão.
- Mover o Python para `scripts/`, que é o conserto de fundo — veja §6.

---

## 3. Decisões tomadas

- **O objeto certo, e não um objeto qualquer.** `findings` ou `summary` é o contrato que o
  restante do job consome; exigi-lo transforma "achei um dict" em "achei a revisão". Um
  objeto ilustrativo no meio da prosa não tem essas chaves e passa a ser pulado, não aceito.

- **Aceitar `summary` sozinho.** Uma revisão sem achados pode legitimamente vir só com o
  resumo. Exigir `findings` reprovaria o caso mais desejável de todos — o PR limpo.

- **Falhar alto, nunca em silêncio.** É a mesma regra da T018, e é o que esta tarefa
  restaura: quando a resposta não contém revisão reconhecível, o job reprova. A varredura
  ampliou a tolerância a formato **sem** ampliar a tolerância a conteúdo.

- **Logar a forma, não o conteúdo.** A T018 já tinha cortado de 4 000 para 300 caracteres
  depois da revisão; a segunda rodada apontou que 300 caracteres crus ainda podem trazer
  trecho do diff em log público. O que diagnostica um problema de **formato** é a forma:
  tamanho, como a resposta começa, quantas chaves de abertura tem e se a palavra `findings`
  aparece. O corpo da revisão não acrescenta diagnóstico e acrescenta exposição.

---

## 4. Alterações realizadas

- `.github/workflows/ai-pr-review.yml`: `CHAVES_DA_REVISAO`, filtro em `extrair_json`, log
  reescrito para descrever a forma.

---

## 5. Verificação e testes

Como na T018, a função é **extraída do próprio YAML** e exercitada, para que o testado seja o
que roda.

- [x] YAML continua válido (`yaml.safe_load`).
- [x] **Dezessete casos, todos passando.** Leem: objeto limpo; objeto seguido de texto; cerca
      de bloco em três variações; preâmbulo em prosa; prosa com `{chave}` literal; chave
      solta que não decodifica; **objeto ilustrativo antes do real** (o caso desta tarefa);
      resposta só com `summary`. Reprovam, como devem: array, string e número; **objeto sem
      `findings` nem `summary`**; resposta sem objeto; JSON truncado.
- [x] **Prova negativa 1**, herdada da T018: o `json.loads` original falha no caso do PR #11
      com `Extra data: line 3 column 1`.
- [x] **Prova negativa 2**, desta tarefa: aceitando qualquer `dict`, a resposta
      `Por exemplo {"severity": "high"}. Segue: {"summary": …, "findings": [1, 2]}` devolve
      `{'severity': 'high'}` — **zero achados, job verde**. Com o filtro, devolve os dois
      achados.

---

## 6. Observações / armadilhas para tarefas futuras

**A correção de um defeito barulhento criou um silencioso, e isso é o padrão a temer.** A
T018 trocava uma falha visível por tolerância a formato; ao ampliar a tolerância, ampliou
junto o que passa. Vale a regra: **ao afrouxar o reconhecimento de uma entrada, verificar
separadamente o que passa a ser aceito** — não basta conferir que o caso que falhava agora
passa.

**A revisão automática achou na segunda rodada o que não tinha achado na primeira.** O
achado só existia depois de a primeira correção ser escrita. Uma revisão por PR não é
suficiente quando a própria correção muda o espaço de entradas; vale reler o resultado da
revisão **depois** de aplicar as mudanças dela, que foi o que faltou no PR #12 — mesclei
antes de ler o segundo parecer.

**O conserto de fundo continua não feito.** O Python do `ai-pr-review.yml` não é exercitado
por nada: não entra no `npm test`, não passa pelo `tsc`, e só roda com PR aberto. Duas
tarefas seguidas mexeram nele com roteiro descartável de verificação. Se houver uma terceira,
**mover a função para `scripts/` e dar-lhe teste de verdade** deixa de ser preferência e vira
o trabalho certo.
