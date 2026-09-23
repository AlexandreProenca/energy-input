# T025: Painéis de temperatura e desconforto com mais de uma zona

- **Status:** Concluída
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T025-zonas-multiplas`
- **Refs:** [`docs/backlog.md`](../backlog.md); T010 (seletor de zona, nunca exercitado com dado
  real); T001 (não conseguiu capturar o 422 de ambiguidade)

---

## 1. Objetivo

A primeira execução real com duas zonas — possível só depois da T016 e da T023 — abriu o
painel de temperatura com erro:

> Não foi possível ler a temperatura — nenhuma série de 'Zone Operative Temperature' com a chave
> e a frequência pedidas; key: existe: key='PAVIMENTO 1 · …', frequency=hourly; …

Era o caminho que a T010 tinha deixado registrado como **nunca exercitado com dado real**: "o
seletor de zonas […] depende de `seriesCandidates`, que tem teste com a fixture do 422 de
variável inexistente — não do de ambiguidade, que não foi possível capturar na T001. Reconferir
quando houver execução multizona."

---

## 2. Escopo

### O que entra

- `src/core/results/candidatas.ts`: lê chave e frequência das candidatas do 422.
- `resultsStore`: abre a primeira zona sozinho, pede chave e frequência, e trata "variável não
  registrada" como ausência, não como erro.
- Painel de desconforto: diz de qual zona são as horas quando há mais de uma.
- Fixtures reais dos dois 422 de chave, anonimizadas.

### O que NÃO entra (deliberadamente postergado)

- **Horas do edifício inteiro** (soma ou média ponderada entre zonas). O painel mostra uma zona
  por vez e diz qual. Agregar zonas exige escolher critério — por área, por ocupação — e é
  decisão de produto.
- **Nomes das zonas como no modelo** (`Pavimento 1 · Ambiente A`) em vez de como o EnergyPlus grava
  (`PAVIMENTO 1 · AMBIENTE A`). A chave precisa ir ao serviço como ele a devolve.

---

## 3. Decisões tomadas

### A causa: um contrato adivinhado em três lugares

O corpo real do 422 de ambiguidade é:

```json
{ "detail": "2 séries de 'Zone Operative Temperature'; escolha uma por key e frequency",
  "errors": [{ "field": "key", "message": "candidata: key='PAVIMENTO 1 · …', frequency=hourly" }, …] }
```

1. `seriesCandidates` entregava a **mensagem inteira** como candidata. O seletor mostrava
   `candidata: key='…', frequency=hourly` como opção.
2. Escolhida uma opção, esse texto ia inteiro como `key`, e o serviço respondia com o **outro**
   422 — "nenhuma série com a chave pedida", listando as que existem com o prefixo `existe:`. Foi
   o erro que o usuário viu.
3. A mesma função tratava a mensagem do 422 de **variável não registrada**
   (`a simulação não registrou '…'`) como se fosse uma zona.

**Por que passou:** o teste do store usava um corpo **inventado**,
`{ field: 'key', message: 'ZONA 1' }`, com a mensagem igual à chave. E o teste da API travava a
passagem da mensagem de variável não registrada como candidata. Os dois validavam o formato que se
imaginava, e o defeito ficou escondido até o primeiro dado real — exatamente o risco que o épico
nomeava ao pedir fixtures reais na T001 ("desenhar gráficos contra formatos adivinhados é
retrabalho garantido"). O 422 de ambiguidade era o único que a T001 não tinha conseguido
capturar.

### O conserto

- **A candidata é o que está entre as aspas.** A regra ignora o prefixo (`candidata:`/`existe:`),
  que distingue o caso e não a chave, e é gulosa até o `', frequency=` final: um nome com
  apóstrofo não corta a chave.
- **Chave e frequência no pedido**, porque é o que o serviço pede ("escolha uma por key e
  frequency"). Uma zona gravada em horária e diária continuaria ambígua só com a chave.
- **Abrir a primeira zona em vez de esperar a escolha.** Parado no seletor, os dois painéis
  diriam "esta execução não registrou a temperatura operativa" — falso, e o mesmo tipo de defeito
  da T008 (dizer "não registrou" do que foi registrado).
- **Variável não registrada é ausência, não erro**, como já era nos medidores. O painel explica
  como ligar o preset Conforto.
- **O desconforto diz de qual zona é.** Com duas zonas, "1 073 h quentes" sem a zona pareceria
  ser do edifício inteiro.

---

## 4. Alterações realizadas

- `src/core/results/candidatas.ts`: novo.
- `src/features/simulation/api.ts`: `seriesCandidates` devolve `{ key, frequency }`.
- `src/features/results/resultsStore.ts`: `frequenciaDaZona`, abertura da primeira zona, 422 sem
  candidata como ausência.
- `src/features/results/panels/DesconfortoPanel.tsx`: a zona das horas.
- `src/core/results/__fixtures__/erro-422-chave-ambigua.json` e `…-chave-inexistente.json`:
  novas, anonimizadas; o `README.md` das fixtures registra a exceção.
- Testes: `src/core/results/__tests__/candidatas.test.ts` (novo, 7); `resultsStore.test.ts`
  reescrito contra as fixtures reais (+5); `resultsApi.test.ts` com a asserção corrigida.
- `docs/DEVELOPMENT.md`: os três 422 e o comportamento com várias zonas.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 345 testes (eram 331; +14 nesta tarefa, 2 da rodada de revisão)
- [x] `npm run build`
- [x] **Prova negativa:** devolvendo o parser ao comportamento antigo, 11 testes reprovam.
- [x] **Contra o serviço real, com a execução que falhou** (duas zonas):
      - o seletor mostra as duas chaves limpas, e a primeira abre sozinha;
      - zona A: mínima 16,3 °C, média 22,5 °C, máxima 27,4 °C; 794 + 1 073 + 6 893 = 8 760 h;
      - troca para a zona B: mínima 16,5 °C, média 22,4 °C, máxima 27 °C;
        825 + 746 + 7 189 = 8 760 h — números próprios, confirmando que cada zona é lida à parte;
      - o painel de desconforto diz "Horas da zona …, uma das 2 que a execução registrou";
      - nenhuma mensagem de "não registrou".
- [x] **Consulta direta ao serviço:** com chave e frequência certas volta a série anual inteira,
      8 760 pontos.

---

## 5.1 Revisão do PR, e um defeito vizinho que ela não apontou

Três achados. **Um virou teste**, dois foram declinados:

| Achado | Veredito |
|---|---|
| A abertura automática poderia reentrar em laço | **teste acrescentado** — a zona aberta leva chave, e o ramo que descobre candidatas só vale sem chave: um segundo 422 vira erro visível. O teste prova que são duas chamadas, não um laço |
| A regra da candidata não ancora o início | **declinado** — é de propósito: o prefixo (`candidata:`/`existe:`) distingue o caso, não a chave. Ancorar nos prefixos conhecidos trocaria um prefixo novo do serviço por falha total |
| 422 sem candidata com zona escolhida vira erro | **declinado** — com zona escolhida, 422 quer dizer que a chave não existe para aquela variável; erro é a resposta certa |

**Ao investigar o primeiro, apareceu um defeito real que a revisão não apontou: `limpar()` nunca
é chamado pelo app.** Ao abrir outra execução, as zonas da anterior continuavam: uma execução de
uma zona, aberta depois da de duas, oferecia no seletor as duas chaves antigas — que não existem
nela —, e o painel de desconforto diria "uma das 2 zonas". A temperatura antiga também ficava na
tela enquanto a nova carregava. O defeito vinha da T010, mas o aviso de zona desta tarefa o
tornaria visível. Agora toda carga sem zona recomeça a descoberta.

Verificado no navegador, alternando entre a execução de duas zonas e uma de zona única (a da
T010): em cada troca, seletor, zona, extremos e aviso corretos, e os valores da zona única
(12,7 °C / 32 °C) iguais aos registrados na T010.

**Uma armadilha minha no teste:** dentro do `describe`, a zona B se chamava `B` e sombreava a
execução `B` do arquivo; o teste pôs uma *string* no lugar da simulação e falhou pelo motivo
errado. Só o isolamento do caso mostrou.

---

## 6. Observações / armadilhas para tarefas futuras

**Teste contra formato inventado é pior que teste nenhum.** Ele não só deixa de pegar o defeito:
trava o comportamento errado e dá confiança a ele. Nesta tarefa, dois testes passavam defendendo
exatamente o que estava quebrado. Quando o contrato de um serviço não pôde ser observado, o teste
deve dizer isso — ou esperar a fixture —, e não preencher a lacuna com um palpite.

**A pendência registrada na T010 estava certa, e foi ela que apontou o lugar.** "Reconferir quando
houver execução multizona" transformou um erro misterioso num diagnóstico de minutos. Registrar o
que não foi verificado continua valendo mais que qualquer confiança no código.

**Responde a uma pergunta que o `MEMORY.md` tinha em aberto:** sim, `key_value: "*"` gera uma
série por zona — duas zonas, duas séries.

**As chaves vêm em maiúsculas**, porque é como o EnergyPlus grava os nomes no `.sql`. O seletor
mostra assim. Mostrar o nome como no modelo exigiria mapear chave e zona sem diferenciar
maiúsculas, e a chave enviada teria de continuar sendo a do serviço.
