# ADR-0004: Cada pessoa entra com e-mail e senha, e o token fica na memória da aba

- **Status:** Aceita
- **Data:** 2026-09-23
- **Contexto da decisão:** T032 ([`../backlog.md`](../backlog.md))
- **Decidida por:** dono do produto ("crie uma tela de login para autenticar um usuário no
  backend e receber o token para consumo, inativando a chave de API por variável de ambiente");
  e-mail e senha, com renovação por cookie HttpOnly, escolhidos por ele entre as alternativas abaixo
- **Substitui:** [ADR-0003](0003-chave-da-api-no-ambiente-do-servidor.md)
- **Depende de:** AlexandreProenca/eng-energy-plus#146 (login de usuário no serviço)

---

## Contexto

Pela ADR-0003, uma chave de API só, a do dono, vivia no ambiente do servidor, e os proxies a
injetavam. Toda simulação caía no mesmo tenant, e quem alcançasse o proxy usava a conta do dono.
Isso não serve a um produto com várias pessoas e organizações, cada uma com os próprios modelos,
simulações e estudos.

O serviço já tem **usuários ligados a um tenant** (e-mail, nome e papel owner/admin/member/
readonly), mas eles **não tinham senha**: o único jeito de obter token era trocar uma chave de
API (`client_credentials`). O login de pessoa foi pedido ao serviço na issue
eng-energy-plus#146, com o contrato que este aplicativo consome.

## Alternativas consideradas

- **Credencial: chave de API do tenant na tela de login.** Não exigiria mudar o serviço, mas a
  credencial é do tenant, não da pessoa: sem identidade individual, sem papel por pessoa, e a
  chave de longa duração digitada no navegador. Descartada pelo dono do produto.
- **Sessão só em memória.** Recarregar a página, ou passar dos 15 minutos do token, pediria
  login de novo. Seguro e simples, mas incômodo demais para uma ferramenta de trabalho.
- **Token em `sessionStorage`.** Sobrevive ao recarregar, mas qualquer script da página o lê —
  um XSS levaria a sessão. E ainda venceria em 15 minutos.
- **Refresh token em cookie HttpOnly (escolhida).** O JavaScript não lê o cookie; o token de
  acesso, curto, fica só na memória da aba e é renovado pelo cookie antes de vencer e ao abrir o
  app.

## Decisão

- A tela de login troca **e-mail e senha** por um token de acesso em `POST /v1/auth/login`. Se a
  senha confere em mais de uma organização, o serviço responde 409 com a lista, e a pessoa
  escolhe.
- **O token de acesso vive só na memória da aba** (`authStore`), nunca em `localStorage` nem
  `sessionStorage`. A senha não sai do componente da tela de login.
- O **refresh token** vem em cookie `HttpOnly; Secure; SameSite=Strict`, que só as rotas
  `/auth/login`, `/auth/refresh` e `/auth/logout` recebem. O app renova um minuto antes de o
  token vencer, ao abrir (recarregar não pede login) e uma vez ao receber 401. Uma renovação por
  vez: duas concorrentes gastariam o mesmo cookie, e a rotação do serviço trataria a segunda
  como reuso.
- **Os proxies deixam de ter credencial.** Repassam o `Authorization` do navegador e, só nas
  rotas de sessão, o cookie, reescrevendo o caminho dele de `/v1/auth` para
  `/simulation-api/v1/auth`. `SIMULATION_API_TOKEN` não é mais lida pelos proxies — só por
  scripts em Node — e o script de inicialização do contêiner, com `SIMULATION_TOKEN_HOSTS`, sai.
- **As recusas dos proxies continuam:** rota fora da lista, método fora de GET/POST e outra
  origem. A origem agora protege o cookie, que o navegador anexa sozinho.
- **Criar e baixar epJSON continua sem conta.** Simular e ver resultados exigem sessão. Sair, ou
  entrar em outra organização, esquece a execução acompanhada, que pertence ao tenant anterior.

## Consequências

- **Até a eng-energy-plus#146 estar em produção, ninguém simula por este aplicativo**: o serviço
  responde 404 ao login, e a tela diz que ele ainda não oferece login. Por isso o PR desta
  decisão só é integrado depois do serviço.
- Cada simulação, estudo e versão de modelo passa a pertencer ao tenant de quem entrou, com os
  escopos do papel dela; `readonly` não simula.
- Cookie `Secure` em `http://localhost`: Chrome e Firefox aceitam, o Safari pode recusar. Fora
  de localhost, o contêiner precisa de TLS na frente.
- Revogar a sessão no serviço só corta o token de acesso quando ele vence (até 15 minutos), a
  mesma janela já aceita para as chaves de API.
- A regra "a interface não pede credencial" da ADR-0003 deixa de valer. A que a substitui:
  **a interface pede e-mail e senha, e nenhuma credencial vai para armazenamento do navegador.**
