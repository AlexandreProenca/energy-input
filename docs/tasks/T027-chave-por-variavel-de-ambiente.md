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

## 5.1 Revisão do PR

Cinco achados. **Dois aceitos**, três declinados — um deles refutado pelo teste real:

| Achado | Veredito |
|---|---|
| [ALTA] `if` com `proxy_pass` poderia fazer o serviço responder 401 mesmo com a chave | **refutado** — no contêiner real, com a chave, `localhost` recebeu **200** passando por esses `if`. E `return` dentro de `if` em `location` é o uso que a documentação do nginx dá como seguro |
| A validação recusa `:` e outros caracteres | **declinado** — o conjunto aceito é exatamente o `b64token` da RFC 6750, a gramática do token Bearer; o comentário do script agora cita a RFC |
| A comparação de origem quebra atrás de proxy que termina o TLS | **aceito** — o nginx vê `http` e o navegador manda `https://`. Passou a comparar só o host. Retestado: origem `https` do próprio host passa; outro site continua 403, inclusive na mesma porta |
| A mensagem do 401 cita só o `.env.local` | **aceito** — agora diz "no ambiente do servidor", com o `.env.local` como o caso do compose e do `npm run dev` |
| `nginxPattern` não escapa `.` | **declinado** — a lista é de expressões regulares por contrato, a mesma nos dois proxies |

Numa segunda rodada, **dois achados procedentes em parte**:

- **O CI não provava que o caminho permitido chegava ao serviço.** O passo antigo tratava qualquer
  código como "alcançou o upstream" — um `proxy_pass` ignorado, que dá 404, passaria. A alegação
  de que os `if` anulam o `proxy_pass` segue refutada pelo 200 observado, mas a lacuna de teste
  era real: agora, sem chave, **só 401** prova que o pedido chegou ao serviço (o nginx nunca
  produz 401 sozinho), e qualquer outro código numa rota permitida reprova.
- **A validação não era exatamente o `b64token`**, como o comentário afirmava: aceitava `=` no
  meio. Agora é a gramática exata (`=` só no fim), com teste no CI. A chave real continua passando.

Declinado: a origem sem porta contra o `Host` com porta — os navegadores omitem a porta padrão nos
dois cabeçalhos e incluem a não padrão nos dois, então eles sempre casam.

A terceira rodada só pôde rodar depois da T030: nas duas anteriores a este commit, a própria
revisão reprovava sem conseguir ler a resposta do modelo, que citava a regex do nginx com barra
invertida crua. Cinco achados; **um procedente em parte**:

- **A validação de `SIMULATION_TOKEN_HOSTS` aceitava o que não é nome de host.** O achado citava
  `..` e `-mal`; testado no contêiner, nenhum dos dois entrega a chave a outro host — viram
  chaves do `map` que nenhum `Host` real casa. **O que o teste mostrou de fato foram as palavras
  reservadas do `map`:** `default` impede o nginx de subir com "duplicate default map parameter",
  e `hostnames` é lido como diretiva, mudando em silêncio como as outras entradas casam. Agora cada
  host precisa seguir a gramática de nome de host (rótulos sem hífen nas pontas) e não pode ser
  palavra reservada, com recusa explicada e cinco casos no CI.

Declinados, por repetirem rodadas anteriores: `if` com `proxy_pass` (o CI agora exige o 401 que
só o serviço produz), origem sem porta, `=` no meio da chave e `.` sem escape nas rotas. E a
mensagem do 401 que cita `SIMULATION_API_TOKEN`: o nome está no README deste repositório público,
e "não configurada" e "recusada" se corrigem no mesmo lugar — o serviço não distingue as duas, e o
proxy de propósito não sabe qual é.

Uma quarta rodada repetiu os achados declinados, com dois ângulos novos, também declinados: a
mensagem de recusa da chave cita o mesmo conjunto da regex (`[A-Za-z0-9._~+/-]`, `=` só no fim),
e a comparação de origem sensível a maiúsculas não afeta navegador — o analisador de URL põe o host
em minúsculas tanto no `Origin` quanto no `Host`.

A quinta rodada também só repetiu, com três ângulos novos declinados: rótulo com hífen inicial
(a regex exige letra ou dígito no começo de **cada** rótulo, e IDN chega como `xn--…`, que casa);
`Origin: null` recusado (é o certo — origem opaca, como iframe isolado, não deve usar a chave); e
o parâmetro `token` de `SimulationApi` que o teste ainda usa. Esse continua de propósito: serve aos
scripts em Node que falam direto com o serviço. Ganhou um comentário dizendo isso, porque o achado
mostra que a leitura do código sugeria o contrário.

Da sexta rodada em diante a revisão só repetiu achados já tratados. O único ângulo novo — "as rotas
do nginx não cobrem sub-recursos que o app usa, como `/models/{id}`" — foi conferido contra
`api.ts`: todo caminho que o cliente chama está na lista, e `/models/{id}` não é chamado. O PR foi
integrado com as checagens verdes e sem achado procedente em aberto.

**Um defeito do CI apareceu nesse meio-tempo**, sem relação com a revisão: numa execução o serviço
não respondeu ao runner em 30 s, e o passo reprovou com "respondeu 000000". O `|| echo 000` da
T017 somava um segundo `000` ao que o curl já escreve, e o resultado não casava com o caso de
serviço inacessível, que devia só avisar. Antes desta tarefa o passo aceitava qualquer código, e
o defeito não aparecia; o `case` estrito da segunda rodada o expôs. Agora é `|| true`.

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
