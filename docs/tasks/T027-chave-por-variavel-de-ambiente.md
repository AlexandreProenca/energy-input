# T027: Chave da API por variável de ambiente, também no contêiner

- **Status:** Concluída
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T027-chave-por-variavel-de-ambiente`
- **Refs:** [ADR-0003](../adr/0003-chave-da-api-no-ambiente-do-servidor.md);
  [`docs/backlog.md`](../backlog.md); T002 (a assimetria entre os proxies, agora desfeita)

---

## 1. Objetivo

Pedido do dono do produto: "a chave da API deve ser configurada via variável de ambiente". A
interface deixa de pedi-la, e ela passa a vir de `SIMULATION_API_TOKEN` também no contêiner —
até aqui, só o `npm run dev` a lia do ambiente.

---

## 2. Escopo

### O que entra

- O nginx injeta a chave, lida do ambiente na inicialização do contêiner
  (`docker/entrypoint.d/15-chave-da-simulacao.sh`).
- As defesas que o proxy de desenvolvimento já tinha, agora também no nginx: lista de rotas,
  GET/POST, recusa de outra origem, chave só para localhost ou hosts declarados.
- A lista de rotas do nginx **gerada** de `scripts/simulationRoutes.ts` (`npm run nginx-routes`),
  com teste de divergência.
- `docker-compose.yml`: porta só em `127.0.0.1`, chave lida do `.env.local`.
- `.dockerignore` sem `.env*`.
- Interface: sai o campo de chave; o 401 diz onde configurar.
- CI: recusas do proxy num contêiner real e canário da chave no bundle.
- [ADR-0003](../adr/0003-chave-da-api-no-ambiente-do-servidor.md) e a regra do AGENTS.md §7.

### O que NÃO entra (deliberadamente postergado)

- **O fluxo do diálogo** — conectar sozinho, acompanhar a execução, "Analisar resultados". É a
  T028. Aqui o botão "Conectar à API" continua, só sem o campo de chave.
- Login de aplicação ou chaves por usuário. Com a chave no servidor, contas separadas pedem
  instâncias separadas.

---

## 3. Decisões tomadas

- **Chave no servidor, nunca `VITE_`.** O Vite embute no bundle público toda variável `VITE_`.
  O canário do CI trava isso: build com uma chave falsa no ambiente e no `.env.local`, e reprova
  se ela aparecer no `dist/`.

- **A premissa da T002 caiu, e o nginx ganhou as defesas do proxy de desenvolvimento.** O
  `location` do nginx repassava qualquer rota porque a credencial era a de cada navegador. Com a
  chave injetada, seria a conta inteira do dono para quem alcançasse a porta. Rota fora da lista
  (404), método (405) e outra origem (403) são recusados no nginx, antes do upstream.

- **Uma lista só, gerada para o nginx.** O mapa do nginx sai de `scripts/simulationRoutes.ts`, e
  o arquivo versionado é comparado ao gerador num teste. Duas listas mantidas à mão divergiriam —
  e a divergência, aqui, é uma rota autenticada a mais.

- **A chave só vai para localhost por padrão.** É a mesma regra do proxy de desenvolvimento, e a
  defesa contra *DNS rebinding*. Um host público precisa ser declarado em `SIMULATION_TOKEN_HOSTS`
  — declarar é assumir que todo visitante simula na conta do dono.

- **Chave validada, e o contêiner recusa subir com ela inválida.** Ela vai entre aspas na
  configuração do nginx; aspas, `$` ou `;` a quebrariam ou injetariam configuração. A mensagem diz
  o motivo.

- **O arquivo gerado com a chave é `0600`, do root.** O nginx precisa lê-la; ninguém mais.

---

## 4. Alterações realizadas

- `scripts/nginxRoutes.ts` (novo), `docker/simulation-routes.conf` (gerado),
  `docker/entrypoint.d/15-chave-da-simulacao.sh` (novo).
- `scripts/simulationRoutes.ts`: exporta a lista, os métodos e o sufixo de query.
- `docker/nginx.conf`: mapa de origem, recusas, chave vinda do mapa.
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `package.json`
  (`nginx-routes`).
- `src/features/simulation/{SimulationDialog.tsx,simulationStore.ts,api.ts}`,
  `src/features/results/resultsStore.ts`: sem chave na interface.
- `.github/workflows/ci.yml`: canário no build; recusas e mapa de autorização no contêiner.
- Testes: `scripts/__tests__/nginxRoutes.test.ts` (novo, 8); `api.test.ts` (+2);
  `simulationStore.test.ts` e `resultsStore.test.ts` sem chave.
- `AGENTS.md` §7, `CLAUDE.md`, `README.md`, `docs/PRD.md`, `docs/DEVELOPMENT.md`.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 367 testes (eram 357; +10 nesta tarefa)
- [x] `npm run build`
- [x] **Prova negativa da divergência:** uma rota nova na lista, sem regenerar o arquivo do
      nginx, reprova o teste.
- [x] **Contêiner real, contra o serviço de simulação:**

      | Pedido | Sem chave | Com chave |
      |---|---|---|
      | `/engines`, `localhost` | 401 | **200** |
      | resumo de uma execução | 401 | **200** |
      | `/api-keys` (fora da lista) | 404 | 404 |
      | conteúdo de modelo (negada) | 404 | 404 |
      | travessia `..%2f` no artefato | 404 | 404 |
      | `DELETE` | 405 | 405 |
      | `Origin` de outro site | 403 | 403 |
      | `Host` de outro domínio (*rebinding*) | 401 | **401** |

      Com `SIMULATION_TOKEN_HOSTS`, o host declarado recebe a chave (200) e outro não (401). Chave
      com aspas: o contêiner sai com código 1 e explica no log. O arquivo com a chave é `0600`.
- [x] **A chave não está em nenhuma camada da imagem** (`docker save` sem ocorrência).
- [x] **O passo novo do CI**, extraído do próprio YAML, passa contra a imagem real.
- [x] **Canário local:** build com chave falsa no ambiente — ausente do `dist/`; a chave real do
      `.env.local`, que o Vite lê no build, também ausente.

---

## 6. Observações / armadilhas para tarefas futuras

**O `.env.local` entrava no cache de build do Docker.** O `.dockerignore` não o excluía, e o `COPY
. .` do estágio de build o gravava numa camada do cache em todo `docker compose up --build` — um
defeito anterior a esta tarefa. A imagem final não o levava (o estágio de build é descartado) nem
o bundle (o Vite só expõe `VITE_`), mas a chave ficava em disco no cache. O `.dockerignore` agora
exclui `.env*`, e o cache de build local foi limpo (`docker builder prune`, que limpa o cache de
todos os projetos da máquina — só cache, refeito na próxima construção).

**O nginx compara `$uri`, não a URL crua.** Ele decodifica `%2f` e resolve `..` antes de comparar,
então a travessia que no proxy de desenvolvimento exige três restrições cai sozinha aqui. Mas a
query string também não entra na comparação — o gerador retira o sufixo de query das rotas.

**Um erro que não aparece na hora continua sendo erro.** Na primeira leitura, o log do contêiner
recusado não mostrava a mensagem: a leitura foi feita antes de o log ser gravado. Ler de novo
mostrou a mensagem. Conferir o que se afirma, mesmo quando o sintoma parece claro.
