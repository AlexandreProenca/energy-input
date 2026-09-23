# T024: As janelas desenhadas pelo usuário acompanham o vidro do assistente

- **Status:** Concluída
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T024-janelas-acompanham-vidro`
- **Refs:** [ADR-0002](../adr/0002-janelas-acompanham-o-vidro-do-assistente.md);
  [`docs/backlog.md`](../backlog.md); T023 (deixou a pergunta em aberto)

---

## 1. Objetivo

A T023 corrigiu as janelas que ficavam apontando para um vidro apagado, mas deixou uma pergunta
de produto: trocar o vidro no assistente deveria trocar também o das janelas que o usuário
desenhou? A resposta do dono do produto:

> A expectativa é que todas mudem. Caso ele precise editar uma em específico, pode usar o modo
> especialista.

---

## 2. Escopo

### O que entra

- `acompanharVidro` (`src/core/sync/`): antes de cada sync, as janelas do usuário que seguem o
  vidro do assistente passam para o vidro novo, com a esquadria.
- Reparo das janelas que o defeito da T023 deixou apontando para um vidro inexistente.
- Aviso na tela para cada mudança, no `wizardStore`.
- [ADR-0002](../adr/0002-janelas-acompanham-o-vidro-do-assistente.md), e a exceção registrada no
  AGENTS.md §7, no PRD §4.4, no `DEVELOPMENT.md` e no `CLAUDE.md`.

### O que NÃO entra (deliberadamente postergado)

- **Estender a mesma lógica a outras escolhas do assistente** (parede, laje, cobertura). O ADR
  limita a exceção ao vidro; cada extensão pede decisão própria.
- Desfazer só a parte das janelas. O desfazer do documento reverte a operação inteira do
  assistente, como qualquer outra.

---

## 3. Decisões tomadas

- **"Segue o vidro do assistente" quer dizer: a construção da janela é o vidro que o assistente
  oferecia até agora.** É o critério que faz "editar uma específica no Especialista" funcionar: a
  janela passa a ter outra construção e deixa de seguir, então a próxima troca no assistente não
  desfaz a escolha. Pegar "toda janela" desfaria justamente o caminho que o dono do produto
  indicou para as exceções.

- **Aplicar antes do sync, e não depois.** Com a janela já no vidro novo, o `planWizardSync` vê o
  vidro antigo sem referência e o remove normalmente. Depois do sync, a regra da T023 o reteria —
  a janela ainda apontaria para ele —, e o vidro velho ficaria como sobra.

- **Janela gerada pelo assistente não passa por aqui.** Ela é regerada pelo próprio gerador, e
  mexer nela mudaria o hash e abriria um conflito falso no `planWizardSync`.

- **A esquadria pertence ao vidro**, que já é a convenção do Editor 3D (`openingConstruction`
  em `edits.ts`). A personalizada — nem vazia, nem de um vidro do assistente — fica.

- **O reparo roda em toda mudança no assistente, não só na troca de vidro.** O documento que
  quebrou no incidente tem o vidro atual certo (PVC) e as janelas no antigo, que não existe
  mais; esperar outra troca de vidro deixaria o usuário travado. O reparo só atua em vidro **do
  catálogo** que **não existe** no documento — a assinatura exata do estrago. Construção
  inexistente de outra origem não é tocada: não há como saber a intenção, e a validação mostra
  o erro.

- **Aviso, não diálogo.** O dono do produto quer a troca sem pergunta; a regra do §7 proíbe o
  silencioso. O aviso cumpre as duas coisas, e diz o caminho do Especialista.

- **`glazingFrameName` extraído** em `src/generators/windows.ts`. O nome da esquadria era um texto
  literal repetido; a função nova seria o terceiro lugar a repeti-lo.

---

## 4. Alterações realizadas

- `src/core/sync/acompanharVidro.ts`: novo.
- `src/store/wizardStore.ts`: aplica antes do sync, no fluxo normal e na resolução de conflito, e
  anuncia depois de gravar.
- `src/generators/windows.ts`: `glazingFrameName`.
- `docs/adr/0002-janelas-acompanham-o-vidro-do-assistente.md`: novo.
- `AGENTS.md` §7, `docs/PRD.md` §4.4, `docs/DEVELOPMENT.md`, `CLAUDE.md`: a exceção.
- Testes: `src/core/sync/__tests__/acompanharVidro.test.ts` (13) e
  `src/store/__tests__/janelasAcompanhamVidro.test.ts` (6).

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 330 testes (eram 311; +19 nesta tarefa)
- [x] `npm run build`
- [x] **Pelo caminho do incidente, no store real:** janela desenhada com vidro simples, preset
      Apartamento → a janela vai para PVC 4 mm com a esquadria, o vidro antigo sai, nenhuma
      referência quebrada, e o aviso aparece.
- [x] **A escolha específica fica:** janela com o vidro duplo low-E importado da biblioteca não
      muda quando o assistente troca o seu.
- [x] **Prova negativa:** sem a integração no `wizardStore`, quatro dos seis testes do store
      reprovam; os dois que passam são as guardas.
- [x] **EnergyPlus 26.1 local:** o caminho do incidente termina `Completed Successfully`, sem erro
      grave; e **o modelo real que falhou**, depois do reparo (2 janelas), também. O modelo foi
      lido só para diagnóstico e não entrou no repositório.
- [x] No navegador: trocar para o preset Apartamento mantém o arquivo válido, sem erro no
      console.

---

## 6. Observações / armadilhas para tarefas futuras

**O preset Apartamento troca o vidro sozinho** (`wizardStore.update`, etapa Envoltória). Foi assim
que o incidente aconteceu sem o usuário abrir a etapa Janelas. Qualquer escolha do assistente que
mude outra resposta por efeito colateral é candidata a surpreender quem desenhou algo à mão.

**A exceção é deliberadamente estreita.** A tentação de generalizar ("toda escolha global do
assistente vale para os objetos do usuário") é grande e errada sem confirmação: o ADR limita a
decisão ao vidro, e o §7 do AGENTS.md diz que estendê-la exige decisão própria.

**Aviso é parte do contrato, e está testado.** Se algum dia a troca passar a ser silenciosa, ela
volta a violar o §7 — o teste "avisa, em vez de mudar em silêncio" existe para isso.
