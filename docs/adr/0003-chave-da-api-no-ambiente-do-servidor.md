# ADR-0003: A chave da API de simulação mora no ambiente do servidor

- **Status:** Substituída pela [ADR-0004](0004-login-de-usuario-e-token-na-memoria.md) (T032)
- **Data:** 2026-09-23
- **Contexto da decisão:** T027 ([`../backlog.md`](../backlog.md))
- **Decidida por:** dono do produto ("a chave da API deve ser configurada via variável de ambiente")
- **Substitui:** a assimetria entre os proxies registrada na T002 (produção repassava qualquer rota)

---

## Contexto

Até aqui a chave da API de simulação tinha dois caminhos:

- no `npm run dev`, o proxy do Vite a lia de `SIMULATION_API_TOKEN`, no `.env.local`, e só a
  injetava em pedido de loopback com `Host` localhost/127.0.0.1;
- no contêiner (nginx), **ninguém** a injetava: o usuário a digitava no diálogo de simulação, e
  ela vivia só na memória da página.

O dono do produto pediu que a chave passe a vir **sempre** de variável de ambiente, e que o
diálogo pare de pedi-la.

O nginx de produção tinha uma premissa que essa mudança derruba. Ele usava um `location` de
**prefixo** que repassava qualquer rota da API, e a T002 registrou isso como assimetria
deliberada em relação ao proxy de desenvolvimento: "aqui a autorização é a do próprio serviço".
Era seguro porque a credencial era a de cada navegador. **Com a chave no servidor, quem alcança
o proxy usa a conta do dono da chave** — inclusive rotas administrativas (`/v1/api-keys`,
`/v1/webhooks`) e a reescrita de modelos.

## Alternativas consideradas

### 1. Variável `VITE_…` no build

Descartada de saída: o Vite embute no bundle toda variável `VITE_`, e o bundle é público. É
exatamente o que a regra "nenhum segredo no bundle" do AGENTS.md §7 proíbe.

### 2. Injetar a chave no nginx e manter o repasse de qualquer rota

O menor esforço, e o pior resultado: o proxy vira um atalho autenticado para a conta inteira.

### 3. Injetar a chave no nginx com as mesmas defesas do proxy de desenvolvimento *(escolhida)*

## Decisão

**A chave vem de `SIMULATION_API_TOKEN`, no ambiente do servidor — o do Vite em desenvolvimento,
o do contêiner em produção. A interface não pede nem guarda credencial.** O nginx passa a ter
as defesas que o proxy de desenvolvimento já tinha:

- **Lista de rotas permitidas**, a mesma do desenvolvimento. O mapa do nginx
  (`docker/simulation-routes.conf`) é **gerado** de `scripts/simulationRoutes.ts` e um teste
  reprova se os dois divergirem. Rota fora da lista: 404.
- **Só GET e POST.** Outro método: 405.
- **Recusa de outra origem.** Pedido com `Origin` diferente do próprio app: 403 — sem isso, uma
  página qualquer aberta no navegador poderia disparar simulações na conta do dono (CSRF).
- **A chave só vai para `localhost` e `127.0.0.1`** por padrão. É a defesa contra *DNS
  rebinding*: um domínio malicioso apontado para 127.0.0.1 chega com outro `Host` e não recebe a
  chave. Para um host público, `SIMULATION_TOKEN_HOSTS` precisa declará-lo — e declarar é
  assumir que **todo visitante daquele host usa a conta do dono da chave**.
- **A chave é validada** na inicialização do contêiner: caracteres fora de `[A-Za-z0-9._~+/=-]`
  impedem o contêiner de subir, porque aspas, `$` ou `;` quebrariam a configuração do nginx ou a
  injetariam.
- **O deploy local escuta só em `127.0.0.1`**, e o `.env.local` fica fora do contexto de build
  do Docker (`.dockerignore`), para não parar em camada de cache.

## Consequências

**O AGENTS.md §7 muda.** A regra passa a dizer onde a chave pode existir — no ambiente do
servidor — em vez de "só no proxy do Vite" e "digitada no navegador, em memória".

**A assimetria da T002 deixa de existir.** Os dois proxies recusam o mesmo. Ampliar a lista de
rotas amplia os dois, e o teste de divergência força isso.

**Um deploy público com a chave configurada é uma decisão de custo, não um detalhe.** Todo
visitante simula na conta do dono. O padrão (só localhost) torna isso impossível por descuido.

**Não há mais caminho para usar outra chave pela interface.** Quem precisar de contas separadas
precisa de instâncias separadas, ou de um login de aplicação — que continua fora do escopo.

## Verificação

- `scripts/__tests__/nginxRoutes.test.ts`: o arquivo do nginx é o que o gerador produz, e as
  regras permitem e recusam o mesmo que o proxy de desenvolvimento, inclusive tudo de
  `DENIED_BY_DESIGN`. Prova negativa: uma rota nova na lista sem regenerar o arquivo reprova.
- **Contêiner real, contra o serviço:** com a chave, `localhost` recebe 200; sem ela, 401; rota
  fora da lista, conteúdo de modelo e travessia, 404; DELETE, 405; outra origem, 403; `Host` de
  outro domínio, 401 mesmo com a chave configurada; host declarado recebe a chave, não
  declarado não; chave com aspas impede a subida, com a mensagem no log. A chave não aparece em
  nenhuma camada da imagem.
- **CI:** o job do contêiner confere as recusas e o mapa de autorização; o build do bundle roda
  com uma chave falsa no ambiente e no `.env.local` e reprova se ela aparecer no `dist/`.
