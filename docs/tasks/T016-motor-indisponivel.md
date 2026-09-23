# T016: Destravar a execução de simulações no serviço

- **Status:** Concluída (falta observar a primeira execução depois da limpeza noturna, veja §5)
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T016-motor-indisponivel`
- **Refs:** [`docs/backlog.md`](../backlog.md); T001 (primeiro registro do sintoma); T021 e
  T022 (desdobramentos)

---

## 1. Objetivo

Nenhuma simulação concluía no serviço de homologação desde 19/09/2026. A T001 tinha
descartado o epJSON deste aplicativo, mas, sem acesso ao servidor, não passou de "a falha é
anterior ao motor". Esta tarefa encontrou a causa e destravou a execução.

O gatilho foi um aviso do serviço em 23/09: `causa: "motor_indisponivel"`, com a simulação
reentregue três vezes.

---

## 2. Escopo

### O que entra

- Diagnóstico da causa, com o erro reproduzido e não só lido no log.
- Correção aplicada **no serviço**.
- A seção "Estado da execução no serviço" de `docs/DEVELOPMENT.md`, que atribuía a falha a
  uma "regressão no serviço" sem nomear qual.

### O que NÃO entra (deliberadamente postergado)

- **O download de artefato**, que a T016 registrava como "segundo sintoma, mesma origem".
  **A origem não é a mesma**: é assinatura de URL, sem relação com o motor. Virou a **T021**.
- **Tornar o conserto durável.** Ele foi aplicado na instância, e o próximo deploy do serviço
  o desfaz. O lugar certo é o repositório do serviço. Virou a **T022**.
- **Nenhum código deste repositório muda.** O defeito era inteiramente do serviço.

---

## 3. Decisões tomadas

### A causa

A imagem de contêiner do motor EnergyPlus era **apagada toda madrugada por uma rotina de
limpeza** do servidor, e o processo que roda as simulações **não tinha permissão para
baixá-la de volta** do registro de imagens.

A limpeza remove toda imagem que nenhum contêiner está usando naquele momento. A imagem do
motor só é usada durante uma simulação, por um contêiner que existe só enquanto ela roda.
Entre uma simulação e outra, para a limpeza, a imagem está abandonada. Na execução seguinte,
a criação do contêiner falhava em menos de um segundo, o serviço reportava
`motor_indisponivel` e desistia depois de três tentativas.

Isso explica a assinatura que estava sem explicação desde 19/09 — `duracao_segundos: 0.0`,
zero artefatos, `err_available: false`. **O EnergyPlus nunca chegou a rodar.** Por isso não
havia `.err`, e por isso o modelo passava na validação: o problema era anterior ao motor,
exatamente como a T001 tinha concluído.

Começou em 19/09 porque a imagem foi instalada pelo deploy de 17/09, e a limpeza só a pega
depois que ela passa de 24 horas de idade.

### O conserto

O processo de simulação passou a ter acesso de leitura ao registro de imagens. Se a imagem
sumir, ele a baixa de volta sozinho na simulação seguinte. A escolha foi do dono do serviço,
entre quatro alternativas apresentadas. A outra metade — impedir que a limpeza apague a
imagem — ficou recomendada na T022.

**O detalhe operacional não está aqui de propósito.** Este repositório é público. Caminhos
no servidor, onde a credencial fica e como o serviço está isolado são informação do serviço,
e vivem no repositório dele, que é privado.

---

## 4. Alterações realizadas

**No serviço** (instância de homologação): acesso de leitura ao registro de imagens para o
processo de simulação, com credencial restrita ao registro necessário. Backup da
configuração anterior guardado no servidor.

**Neste repositório:**

- `docs/DEVELOPMENT.md`: a seção "Estado da execução no serviço" passa a registrar a causa.
- `docs/backlog.md`: T016 concluída; T021 e T022 criadas.
- `CHANGELOG.md`: entrada da T016.

---

## 5. Verificação e testes

- [x] **O erro foi reproduzido**, e não só lido no log: com a imagem ausente, o processo de
      simulação recebia `unauthorized` do registro.
- [x] **A origem foi confirmada no agendamento do servidor**: a limpeza roda todo dia, na
      mesma hora, e o estado depois dela mostrava zero espaço recuperável — a marca de uma
      limpeza agressiva recente.
- [x] **Depois do conserto**, o mesmo teste passou de `unauthorized` (saída 1) para
      `Image is up to date` (saída 0).
- [x] O motor responde `EnergyPlus, Version 26.1.0-6f2e40d102`.
- [ ] **A recuperação completa depois de uma limpeza real ainda não foi observada.** O teste
      que a provaria — apagar a imagem e deixar o serviço rebaixá-la — seria destrutivo, e
      não foi feito. A prova virá da primeira simulação depois da limpeza de 23/09.
      Evidência indireta de que cabe no prazo: a criação do contêiner tem teto de 60 s, e
      rebaixar a imagem depois de apagada levou menos de 10 s, porque a maior parte das
      camadas continua no disco.

---

## 6. Observações / armadilhas para tarefas futuras

**Um sintoma não é uma causa.** A T016 juntava o download de artefato como "segundo
sintoma, mesma origem" porque os dois apareceram juntos e os dois eram do serviço. O
diagnóstico mostrou que não têm nada em comum. Agrupar pelo lugar onde o defeito aparece, e
não pelo que o causa, teria escondido a T021 atrás de um conserto que não a resolve.

**A T001 estava certa com o que tinha.** "A falha está antes do motor" era a conclusão
correta sem acesso ao servidor. O que faltava não era raciocínio, era o log do serviço. Com
acesso, a causa apareceu rápido.

**Documentação de repositório público tem de parar antes do servidor.** A primeira versão
deste documento descrevia a instância em detalhe — caminhos, contas, onde fica a credencial
e como o serviço está isolado — e ia para um repositório aberto. Foi reescrita antes do
commit. O que interessa a quem mantém este aplicativo é o efeito sobre ele; o mapa da
infraestrutura é do serviço.

**O que isto destrava aqui:**

- a verificação de ponta a ponta dos painéis com um modelo **gerado por este aplicativo**. As
  fixtures da T001 vieram de um modelo sem ocupante nem climatização (`conditioned: 0 m²`);
- o 422 de ambiguidade de chave, que exige uma execução com mais de uma zona e ainda não foi
  capturado;
- a política de retenção do `.sql`, observável com execuções novas.
