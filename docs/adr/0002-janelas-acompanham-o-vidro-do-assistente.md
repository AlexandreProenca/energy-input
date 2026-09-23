# ADR-0002: As janelas desenhadas pelo usuário acompanham o vidro do assistente

- **Status:** Aceita
- **Data:** 2026-09-23
- **Contexto da decisão:** T024, a partir da pergunta deixada em aberto pela T023
  ([`../backlog.md`](../backlog.md))
- **Decidida por:** dono do produto

---

## Contexto

O AGENTS.md §7 tem como regra inviolável a proteção contra perda de dados do usuário: o
assistente **nunca sobrescreve em silêncio** objeto criado ou editado no Modo Especialista ou
no Editor 3D, e diante de divergência abre o diálogo de conflito. O PRD §4.4 diz o mesmo.

Em 23/09 uma simulação real falhou por causa de uma consequência dessa regra. O usuário
desenhou janelas no Editor 3D com o vidro que o assistente oferecia. Depois escolheu o preset de
envoltória **Apartamento**, que troca o vidro para PVC 4 mm **sozinho**. As janelas geradas pelo
assistente mudaram de vidro; as desenhadas pelo usuário, não. Pior: o sync apagou o vidro
antigo, e elas ficaram apontando para o nada. O EnergyPlus parou com `invalid construction_name`.

A T023 corrigiu a parte do nada: o sync passou a reter o vidro antigo enquanto alguma janela
apontar para ele. Mas deixou o comportamento de fundo intacto — trocar o vidro no assistente
trocava só uma parte das janelas — e registrou a pergunta como decisão de produto.

## Alternativas consideradas

### 1. Manter como a T023 deixou

As janelas desenhadas ficam com o vidro com que foram criadas. Coerente com a regra, e
surpreendente para quem usa: escolher um vidro no assistente e ver o modelo com dois vidros
diferentes, sem aviso, e a troca pode nem ter sido feita pelo usuário (o preset a faz).

### 2. Perguntar a cada troca de vidro

Abrir um diálogo: "aplicar também às janelas que você desenhou?". Respeita a letra da regra,
mas interrompe uma operação que o dono do produto considera óbvia.

### 3. Todas as janelas acompanham, com aviso *(escolhida)*

A expectativa declarada é que **todas** mudem. Para ajustar uma janela específica, o usuário
usa o Modo Especialista.

## Decisão

**Trocar o vidro no assistente troca também o das janelas desenhadas pelo usuário que o
seguem.** A exceção à regra do §7 é estreita e anunciada:

- **Só janelas que seguem o vidro do assistente** — aquelas cuja construção é o vidro que o
  assistente oferecia até então. Uma janela com outra construção, escolhida no Especialista ou
  no Editor 3D, é escolha específica e **fica como está**. É isso que torna "ajuste uma específica
  no Especialista" um caminho estável: a próxima troca no assistente não o desfaz.
- **Só a construção e a esquadria.** A esquadria acompanha o vidro, como já acontece no Editor
  3D; a esquadria personalizada fica. Nada mais na janela muda.
- **Janela gerada pelo assistente não passa por aqui** — ela é regerada por ele.
- **Nunca em silêncio.** O assistente mostra quantas janelas desenhadas pelo usuário mudaram e
  lembra o caminho do Especialista. A regra do §7 proíbe sobrescrever *silenciosamente*; esta
  mudança é declarada.
- **Reparo das janelas já quebradas.** Janela que aponta para um vidro do catálogo que não existe
  mais no documento — o estrago do defeito corrigido na T023 — passa para o vidro atual na
  próxima mudança no assistente, com aviso próprio. Construção inexistente que não é vidro do
  catálogo não é tocada: não há como saber o que o usuário queria, e a validação mostra o erro.

A troca é uma operação comum do documento, e o **desfazer** (`Ctrl+Z`) a reverte.

## Consequências

**O AGENTS.md §7 e o PRD §4.4 passam a citar esta exceção.** Sem isso, o código contradiria a
regra que os documentos chamam de inviolável, e a próxima pessoa a mexer no sync "consertaria" o
comportamento.

**A regra de fundo continua valendo para todo o resto.** Parede, laje, material, carga: objeto
do usuário segue intocado. Esta decisão é sobre o vidro. Estendê-la a outra escolha do
assistente exige decisão própria, porque o raciocínio ("o usuário espera que valha para tudo")
precisa ser confirmado caso a caso.

**Documentos quebrados antes da T023 se consertam sozinhos**, na primeira mudança no
assistente — incluindo o que causou o incidente.

## Verificação

`src/core/sync/__tests__/acompanharVidro.test.ts` (14 testes) e
`src/store/__tests__/janelasAcompanhamVidro.test.ts` (6, pelo caminho do incidente: janela
desenhada com vidro simples e preset Apartamento). Prova negativa: sem a integração no
`wizardStore`, quatro dos testes do store reprovam. EnergyPlus 26.1 local: o caminho do
incidente e o modelo real que falhou, depois do reparo, terminam sem erro grave.
