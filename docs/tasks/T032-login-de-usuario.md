# T032: Login de usuário, no lugar da chave por variável de ambiente

- **Status:** Implementada; aguarda o serviço (eng-energy-plus#146) para integrar
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T032-login-de-usuario`
- **Refs:** [`docs/backlog.md`](../backlog.md);
  [ADR-0004](../adr/0004-login-de-usuario-e-token-na-memoria.md), que substitui a ADR-0003;
  AlexandreProenca/eng-energy-plus#146; pedido do dono do produto — "crie uma tela de login para
  autenticar um usuário no backend e receber o token para consumo, inativando a chave de api por
  variável de ambiente, cada usuário está associado a um tenant no backend, que vai poder fazer os
  estudos e versionar as simulações"

---

## 1. Objetivo

Trocar a chave única do dono, injetada pelos proxies (T027), por login de cada pessoa: e-mail e
senha trocados por um token com o tenant e os escopos do papel dela. Simulações, estudos e
versões de modelo passam a ser da organização de quem entrou.

---

## 2. Escopo

### O que entra

- **Tela de login** (`src/features/auth/LoginScreen.tsx`): e-mail, senha e, quando a conta está
  em mais de uma organização, a escolha dela. Ocupa a tela inteira, por cima de qualquer diálogo.
- **Sessão** (`authStore`): token de acesso só em memória; renovação pelo cookie HttpOnly ao
  abrir o app, um minuto antes de vencer e uma vez ao receber 401; uma renovação por vez; sair.
- **Conta no cabeçalho:** "Entrar", ou quem entrou, a organização, o papel e "Sair".
- **Simular e Resultados exigem sessão;** criar, editar e baixar epJSON, não.
- **Cliente da API** (`usarCredencial`): o token da sessão, com uma renovação e uma repetição
  no 401.
- **Proxies sem credencial:** repassam o `Authorization` do navegador e, só nas rotas de sessão,
  o cookie, com o caminho reescrito. Saem o script de inicialização do contêiner,
  `SIMULATION_TOKEN_HOSTS` e o `env_file` do compose.
- **Rotas:** `/v1/auth/login`, `/v1/auth/refresh` e `/v1/auth/logout` na lista.
- ADR-0004, AGENTS.md §7, CLAUDE.md, README, PRD, DEVELOPMENT, CONTEXT e `.env.example`.

### O que NÃO entra (deliberadamente postergado)

- **O login no serviço.** O dono do produto pediu que mudanças no backend virem issue no
  repositório dele: é a **eng-energy-plus#146**, com o contrato que este aplicativo consome.
  Até ela estar em produção, o serviço responde 404 ao login e a tela diz isso.
- **As telas de estudos e de versões.** O pedido diz que o tenant "vai poder fazer os estudos e
  versionar as simulações"; o serviço já tem estudos (`/v1/studies`) e versões de modelo, e o
  login é o que os põe na conta certa. As telas são a Fase 3 do épico E1 (T012–T015), próximas
  depois desta.
- **Cadastro, troca e recuperação de senha pelo aplicativo.** A senha é definida no `/admin` do
  serviço (#146).

---

## 3. Decisões tomadas

- **E-mail e senha, com renovação por cookie HttpOnly**, escolhidos pelo dono do produto entre
  quatro alternativas (ADR-0004). O token de acesso nunca vai para armazenamento do navegador;
  o que sobrevive ao recarregar é o cookie, que o JavaScript não lê.

- **O contrato foi escrito antes do serviço**, na issue #146, a partir do que o serviço já tem:
  usuários por tenant com papel, Argon2id, JWT RS256 com `tenant_id` e `scope`, recusa única com
  tempo constante e erros no formato RFC 9457. Os nomes ficam em `/v1/auth/*` para não colidir
  com as sessões de co-simulação planejadas no serviço (`/v1/sessions`).

- **Uma renovação por vez.** Os painéis de resultados disparam vários pedidos juntos; com o token
  vencido, cada um tentaria renovar. O serviço rotaciona o refresh token e trata reuso como
  roubo — duas renovações concorrentes derrubariam a sessão. `renovar` devolve a mesma promessa
  a todos.

- **Falha de rede na renovação não derruba a sessão;** recusa do serviço, sim. Sem resposta, o
  token atual continua até vencer.

- **Uma repetição no 401, só com a sessão do navegador.** Token de script não tem como renovar,
  e renovar "com sucesso" sem que o serviço aceite não pode virar laço.

- **Sair, ou entrar em outra organização, esquece a execução acompanhada** (estado e
  `sessionStorage`): ela pertence ao tenant anterior.

- **As recusas dos proxies ficam.** A ADR-0003 as justificava pela chave no servidor, e a chave
  saiu. Mas a lista de rotas é a superfície que o aplicativo usa, e a recusa de outra origem
  agora protege o cookie, que o navegador anexa sozinho — o CI confere que `refresh` vindo de
  outra origem dá 403.

- **O canário do build continua.** `SIMULATION_API_TOKEN` segue no `.env.local`, agora para os
  scripts em Node, e o Vite não pode embuti-la.

---

## 4. Alterações realizadas

- `src/core/auth/sessao.ts`: novo — `lerSessao`, `lerRecusa`, `quandoRenovar`.
- `src/features/auth/`: novos — `authStore.ts`, `LoginScreen.tsx`, `Conta.tsx`.
- `src/features/simulation/api.ts`: `ProvedorDeCredencial`, `usarCredencial`, repetição no 401 e
  mensagem nova.
- `src/features/simulation/SimulationDialog.tsx` e `src/features/results/ResultsShell.tsx`:
  estado sem sessão.
- `src/App.tsx`: `iniciar` ao abrir, `Conta` no cabeçalho, `LoginScreen`.
- `scripts/simulationProxy.ts`: sem credencial; repassa `Authorization` e o cookie de sessão.
- `scripts/cookieDeSessao.ts`: novo — caminho e `Domain` do cookie.
- `scripts/simulationRoutes.ts`, `docker/simulation-routes.conf`: rotas de sessão.
- `docker/nginx.conf`, `Dockerfile`, `docker-compose.yml`, `.env.example`; removido
  `docker/entrypoint.d/15-chave-da-simulacao.sh`.
- `.github/workflows/ci.yml`: as verificações da chave viram verificações do repasse.
- `scripts/simulation-api-check.ts`: manda o próprio token.
- Documentação listada no escopo.
- Testes: `src/core/auth/__tests__/sessao.test.ts` (novo, 10), `src/features/auth/__tests__/
  authStore.test.ts` (novo, 12), `scripts/__tests__/cookieDeSessao.test.ts` (novo, 6) e
  `api.test.ts` (reescrito para a sessão: +5).

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 445 testes (eram 412; +33 nesta tarefa, 3 da revisão do PR)
- [x] `npm run build`
- [x] **Nenhuma credencial em armazenamento:** o teste do store entra, renova e confere que nem o
      token nem a senha aparecem em `localStorage`, `sessionStorage` ou no estado.
- [x] **Contêiner, as verificações do CI rodadas localmente:** sem token e com token falso, 401
      do serviço; rota fora da lista, `/auth/token`, `DELETE`, outra origem e `refresh` de outra
      origem recusados no nginx (404, 404, 405, 403, 403), e `refresh` sem `Origin` também (403); a configuração carregada repassa o
      `Authorization` do navegador, o cookie só pelo mapa das rotas de sessão e reescreve o
      caminho; `SIMULATION_API_TOKEN` definido no contêiner não aparece na configuração.
- [x] **No navegador:** ao abrir, o app tenta renovar (`/auth/refresh` → 404, porque o serviço
      ainda não tem a rota) e fica anônimo, com "Entrar" no cabeçalho; Simular sem sessão pede
      login; a tela de login abre por cima do diálogo, com foco no e-mail; "Continuar sem
      entrar" volta ao diálogo; Resultados sem sessão pede login; tudo em 375 px de largura.
- [ ] **Login real, renovação e saída contra o serviço:** dependem da #146. O formulário não foi
      enviado no navegador — nem com credencial de teste — e o fluxo está nos testes do store,
      contra o contrato da issue.

---

## 5.1 Revisão do PR

Cinco achados. **Três aceitos**, dois declinados:

| Achado | Veredito |
|---|---|
| Pedido sem `Origin` numa rota de sessão chegaria ao serviço com o cookie | **aceito** — o navegador sempre manda `Origin` em POST, e o `SameSite=Strict` já barraria o cookie vindo de outro site; ainda assim, as três rotas de sessão passaram a exigir `Origin` nos dois proxies (403), com teste e verificação no CI |
| O 401 tentaria renovar mesmo sem sessão | **aceito** — não era laço (a renovação é única e a repetição, uma só), mas era uma chamada inútil a cada pedido recusado. Só renova quem mandou token |
| O fallback de `Set-Cookie` juntaria vários cookies num só | **aceito** — o Node 18 do projeto já tem `getSetCookie`, mas o fallback agora separa pela vírgula seguida de `nome=`, sem cortar o `Expires` |
| A reescrita do caminho ampliaria o escopo do cookie | **declinado** — o sufixo é preservado (`/v1/auth/` vira `/simulation-api/v1/auth/`), e o escopo é o mesmo |
| O mapa do cookie usa `$uri` | **declinado** — `$uri` é o caminho decodificado e normalizado, o mesmo que o mapa de rotas usa: `auth/../engines` vira `/engines` e não recebe cookie |

Numa segunda rodada, cinco achados, **todos declinados**:

| Achado | Veredito |
|---|---|
| A âncora do mapa `$sessao_sem_origem` não se aplicaria, e `/auth/loginx` viraria rota de sessão | **não acontece** — o texto casado é `"$uri\|$http_origin"`; com `Origin` vazio, `\|$` exige que a rota termine logo antes da barra, e `/auth/loginx` nem passa pela lista (404) |
| A reescrita pegaria `Path=/v1/auth/token` | **declinado** — só respostas das três rotas de sessão são reescritas, e a reescrita mapeia o mesmo caminho para o proxy, sem ampliar |
| No Vite, `req.url` poderia vir com o prefixo e o cookie não seria tratado | **conferido no servidor de desenvolvimento** — vem sem prefixo: `refresh` sem `Origin` dá "Origem não informada", que só sai quando a rota é reconhecida como de sessão, e com `Origin` o pedido chega ao serviço |
| A repetição no 401 reenviaria um corpo multipart já consumido | **não acontece** — `FormData` e texto não são consumidos pelo `fetch`, que os serializa a cada envio; o cliente não manda stream |
| Os dois mapas do nginx poderiam divergir na normalização | **declinado** — os dois usam o mesmo `$uri` |

---

## 6. Observações / armadilhas para tarefas futuras

**Este PR só é integrado depois da eng-energy-plus#146 em produção.** Integrado antes, ninguém
simula pelo aplicativo: não há mais chave no servidor, e o login responde 404.

**O contrato vive na issue até o serviço publicá-lo no OpenAPI.** Quando publicar, confira os
nomes de campo contra `lerSessao` e `lerRecusa` — e troque os corpos inventados dos testes por
fixtures reais, a lição da T025.

**Safari e cookie `Secure` em `http://localhost`.** Chrome e Firefox aceitam; o Safari pode
recusar, e aí a sessão não sobrevive ao recarregar no contêiner local.
