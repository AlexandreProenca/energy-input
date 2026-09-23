# T028: Acompanhamento da simulação e "Analisar resultados"

- **Status:** Concluída
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T028-acompanhamento-da-simulacao`
- **Refs:** [`docs/backlog.md`](../backlog.md); pedido do dono do produto — "quando clicado em
  simular deve aparecer o acompanhamento da simulação, com um botão de analisar resultados que
  leva para a página de resultados"; T027 (sem o campo de chave, o diálogo pode conectar sozinho)

---

## 1. Objetivo

Hoje, para simular, o usuário clica em "Conectar à API", escolhe o motor, busca a cidade do
clima, escolhe a estação e só então envia. Depois disso vê um estado em texto ("Na fila",
"Simulando") e, no fim, uma tabela de três colunas, sem caminho para os gráficos do modo
Resultados.

O pedido: clicar em Simular e ver a execução andar, com um botão que leva aos resultados.

---

## 2. Escopo

### O que entra

- **O diálogo conecta sozinho** ao abrir e já traz escolhidos o motor compatível e o clima do
  catálogo mais próximo do modelo.
- **Duas vistas:** configurar e acompanhar. A de acompanhar tem uma linha do tempo de quatro
  etapas (Envio → Fila → EnergyPlus → Resultados).
- **Concluída:** "Analisar resultados" fecha o diálogo e abre o modo Resultados; "Nova
  simulação" volta ao formulário.
- **Falha, tempo esgotado ou cancelamento:** o motivo, o diagnóstico do EnergyPlus aberto e
  "Ajustar o modelo".
- `src/core/simulation/acompanhamento.ts`: as decisões, testadas sem DOM.
- `SimulationApi.weatherNear`: a busca por coordenadas que o contrato já oferecia.

### O que NÃO entra (deliberadamente postergado)

- **A tabela de resultados no diálogo.** Saiu: o modo Resultados mostra o mesmo resumo em
  painéis, e o pedido foi levar até lá.
- **Tempo decorrido e posição na fila.** O serviço não informa posição, e o tempo exigiria um
  relógio na tela que o `duration_seconds` do fim já resume.
- **Subir o EPW do assistente sozinho.** O arquivo não fica guardado depois da importação, e o
  envio exige declarar a licença. Sem clima perto, o diálogo pede o EPW.

---

## 3. Decisões tomadas

- **Clima por coordenadas, não por nome.** O contrato de `/weather` aceita `near=lat,lon` com
  `radius_km`, e a resposta traz `distance_km`. A busca por cidade **diferencia acentos**:
  "Florianópolis", como o modelo grava, não acha "Florianopolis", como o catálogo guarda. Pelas
  coordenadas do `Site:Location`, o clima certo aparece a 7,8 km. O raio é o padrão do serviço,
  100 km: longe disso, o arquivo já não representa o local, e o diálogo diz que não achou em vez
  de escolher qualquer um.

- **Menor `distance_km`, sem confiar na ordem da lista.** O contrato não promete ordenação.

- **Motor:** o padrão do serviço, se compatível; senão, a versão compatível mais nova. Antes era
  a primeira da lista, que dependia da ordem do serviço.

- **Etapas a partir do estado atual.** O serviço não guarda a história da execução, só o estado.
  Falha e tempo esgotado são marcados no EnergyPlus, que é onde acontecem; o cancelamento também,
  como interrupção, porque o serviço não diz se ela saiu da fila. Estado desconhecido, de uma
  versão futura do serviço, conta como "na fila": ainda não terminou, e é isso que importa.

- **"Resultados" termina quando a consulta termina, não quando dá certo.** `resultadosDe`, no
  store, guarda o **id** da execução consultada — um booleano valeria para a próxima execução
  aberta. Se uma das quatro consultas falha, a etapa termina e o erro aparece; senão a roda
  giraria para sempre ao lado da mensagem.

- **"Nova simulação" só troca a vista.** A primeira versão limpava a execução no store, e o modo
  Resultados, atrás do diálogo, ficava vazio — mesmo se o usuário desistisse de simular de novo.
  Visto no navegador. Agora a execução anterior continua em Resultados até outra começar, e
  `start` é o único que a substitui. Fechar o diálogo volta à vista de acompanhamento, para que
  uma execução aberta por outro caminho (pelo ID, no modo Resultados) não fique escondida atrás
  do formulário.

- **A mensagem de sucesso não promete painel.** A primeira versão dizia "consumo, temperatura e
  desconforto estão prontos"; temperatura e desconforto dependem do preset Conforto. É o mesmo
  tipo de afirmação que a T008 e a T025 corrigiram.

---

## 4. Alterações realizadas

- `src/core/simulation/acompanhamento.ts`: novo — `etapasDaExecucao`, `localDoModelo`,
  `pontoDeBusca`, `motoresCompativeis`, `motorPreferido`, `climaMaisProximo`.
- `src/features/simulation/SimulationDialog.tsx`: conexão automática, duas vistas, linha do
  tempo, "Analisar resultados", "Ajustar o modelo", "Nova simulação".
- `src/features/simulation/simulationStore.ts`: `resultadosDe`.
- `src/features/simulation/api.ts`: `weatherNear`.
- `docs/DEVELOPMENT.md`, `docs/PRD.md` §4.5.
- Testes: `src/core/simulation/__tests__/acompanhamento.test.ts` (novo, 14) e
  `simulationStore.test.ts` (+2).

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 398 testes (eram 382; +16 nesta tarefa, 1 da revisão do PR)
- [x] `npm run build`
- [x] **Contra o serviço real, no navegador**, com um projeto em Florianópolis:
      - o diálogo abriu conectado, com o motor 26.1.0 e o clima de Florianópolis, "a 7,8 km de
        Florianópolis - SC", já escolhidos — as requisições foram `engines` e
        `weather?near=-27.67,-48.547&radius_km=100`;
      - Simular: a linha do tempo passou por Na fila → Simulando → "Concluída — consultando os
        resultados…" → Concluída, com as quatro etapas marcadas;
      - "Analisar resultados" fechou o diálogo e abriu o modo Resultados na execução nova, com o
        consumo mensal desenhado;
      - acompanhar a mesma execução pelo ID: as quatro etapas concluídas e os mesmos botões;
      - "Nova simulação" abriu o formulário, e o modo Resultados continuou mostrando a execução;
        reabrindo o diálogo, a vista de acompanhamento voltou.
- [ ] **Caminho de falha no navegador:** não houve execução real com falha nesta tarefa. A vista
      usa o mesmo diagnóstico de antes, e as etapas de falha estão nos testes do módulo puro.

---

## 5.1 Revisão do PR

Quatro achados. **Dois aceitos**, um em parte, um declinado:

| Achado | Veredito |
|---|---|
| Se a busca automática do clima falhar depois da conexão, o bloco do clima fica sem explicação | **aceito** — a falha tem estado próprio: aviso no bloco, busca manual aberta e o motivo no topo. A conexão continua valendo |
| `comparar` com `Number` vira NaN numa versão com sufixo (`26.1.0-beta`) e a ordenação fica indefinida | **aceito** — `parseInt` por parte, com teste |
| "Voltar e ajustar" fecha o diálogo em vez de voltar ao formulário | **aceito em parte** — fechar é de propósito: a falha é do modelo, e o ajuste é no modelo, não no motor ou no clima. O rótulo virou **"Ajustar o modelo"**, que diz isso |
| O clima pré-selecionado não acompanha o `Site:Location` se o documento mudar com o diálogo aberto | **declinado** — o diálogo é modal; o documento não muda enquanto ele está aberto. Ao reabrir, a conexão e a busca rodam de novo |

---

## 6. Observações / armadilhas para tarefas futuras

**A busca de clima por cidade diferencia acentos.** Quem digitar o nome como o modelo grava não
acha nada. É do serviço; aqui a pré-seleção contorna usando coordenadas, mas a busca manual
continua sujeita a isso.

**O catálogo de clima tem só o que foi enviado.** Hoje são dois arquivos. Para a maior parte
das cidades o diálogo vai dizer que não há clima a 100 km e pedir o EPW — é o comportamento
certo, não um defeito da busca.

**Escape só fecha o diálogo com o foco dentro dele.** É do `Dialog` compartilhado, anterior a
esta tarefa.
