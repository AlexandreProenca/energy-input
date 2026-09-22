# T002: Liberar séries e estudos no proxy de desenvolvimento; paridade do nginx

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T002-allowlist-series-e-estudos`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; T001 (fixtures reais)

---

## 1. Objetivo

O allowlist do proxy de desenvolvimento barrava tudo que o épico de dashboards precisa:
`/results/timeseries`, `/results/variables` e todo `/v1/studies…` respondiam **404 do
próprio proxy**, e só `weather` e `models` podiam levar query string. Sem isto, nenhuma das
tarefas seguintes roda no `npm run dev`.

O regex também não tinha teste nenhum — um controle de segurança sem teste é uma suposição.

---

## 2. Escopo

### O que entra

- `src/core/ids.ts`: padrões de identificador da API num lugar só.
- `scripts/simulationRoutes.ts`: allowlist como módulo puro e testável, fora do plugin.
- Rotas novas: `results/(variables|timeseries)` com query string, `simulations` com query
  string (os filtros de listagem) e os estudos paramétricos
  (`/v1/studies`, `/v1/studies/std_…`, `…/(runs|results|cancel)`).
- `scripts/__tests__/simulationRoutes.test.ts`: 30 asserções, com as listas de aceite e de
  recusa.
- `docker/nginx.conf`: `gzip_proxied`, HTTP/1.1 no upstream, buffers e timeout compatíveis
  com páginas de série de ~1 MB.
- `docker/nginx.conf`: **`proxy_ssl_verify_depth 3`** — correção de um defeito
  pré-existente que deixava *toda* chamada a `/simulation-api` em 502 na imagem Docker.

### O que NÃO entra (deliberadamente postergado)

- Tipos e métodos de série no cliente da API — **T003**.
- Tipos e métodos de estudo — **T012**.
- `…/studies/{id}/iterations*` e as demais rotas listadas em `DENIED_BY_DESIGN`.

---

## 3. Decisões tomadas

- **Allowlist como lista de rotas, não como um regex único.** O regex anterior tinha 180
  caracteres numa linha e aninhava grupos opcionais em três níveis; acrescentar estudos ali
  seria ilegível. Agora cada rota é uma entrada com comentário, e o regex é montado por
  `join('|')`. O custo é uma alternância maior; o ganho é poder ler o que está aberto.

- **`DENIED_BY_DESIGN` é exportado e percorrido pelo teste.** Documentar o que ficou de fora
  num comentário envelhece calado. Como lista executável, ampliar `ROUTES` por descuido
  quebra o teste na hora.

- **Import relativo em `simulationRoutes.ts`, não `@/core/ids`.** `vite.config.ts` carrega
  este módulo através de `simulationProxy.ts`, e o esbuild resolve a config **antes** de
  existir o `resolve.alias` que ela mesma declara. Com alias, o `npm run dev` nem sobe.

- **`isAllowedSimulationRoute` devolve um type predicate (`url is string`).** Sem isso o
  `tsc` perde o estreitamento que o `!req.url` antigo dava, e o chamador precisaria repetir
  a checagem de `undefined` logo depois de já ter passado pelo guarda.

- **Padrão do nome de artefato apertado de `[^/?#]+` para `[A-Za-z0-9][A-Za-z0-9._-]*`.**
  Veja §6 — foi o achado mais relevante da tarefa.

- **Nenhuma rota liberada no nginx.** O `location` de produção é de prefixo e já repassava
  tudo. O que faltava era desempenho, não acesso.

- **Não abrir ADR.** Nada aqui contraria ou estende o PRD; o épico e o modo de estudo já
  estão decididos no backlog (AGENTS.md §4).

---

## 4. Alterações realizadas

- `src/core/ids.ts`: novo. `ULID`, `SIMULATION_ID`, `STUDY_ID`, `MODEL_ID`,
  `MODEL_VERSION_ID`, `WEATHER_ID`, `isSimulationId`, `isStudyId`.
- `scripts/simulationRoutes.ts`: novo. `isAllowedSimulationRoute` e `DENIED_BY_DESIGN`.
- `scripts/simulationProxy.ts`: passa a usar o guarda; o regex embutido saiu.
- `src/features/simulation/simulationStore.ts`: as duas cópias do padrão `sim_…` viraram
  `isSimulationId`.
- `scripts/__tests__/simulationRoutes.test.ts`: novo, 30 testes.
- `docker/nginx.conf`: `gzip_proxied any`, `proxy_http_version 1.1` + `Connection ""`,
  buffers de 32k/16×64k/128k, `proxy_read_timeout 120s`, e o comentário explicando que o
  allowlist é controle só de desenvolvimento.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 109 testes (eram 79; +30 nesta tarefa)
- [x] `npm run build`
- [x] `nginx -t` dentro de `nginx:1.27-alpine`
- [x] **Ponta a ponta no `npm run dev`**, contra o serviço real: `results/variables`,
      `results/timeseries` com query string e `/v1/studies` respondem **200** (antes, 404 do
      proxy); `/v1/usage`, `/v1/api-keys` e `/v1/auth/jwks.json` seguem **404** com
      `{"detail":"Rota de simulação não disponível."}`.
- [x] **Ponta a ponta no contêiner de produção** (`docker build` + `docker run`), com a
      config versionada e `proxy_ssl_verify on`: a série responde **200** com
      `Content-Encoding: gzip`, **148 160 B comprimidos para 904 235 B** de original
      (6,1:1) e os **8 760 pontos** do ano numa página só.

---

## 6. Observações / armadilhas para tarefas futuras

**O proxy de produção nunca funcionou, e o motivo não era o que parecia.** Toda chamada a
`/simulation-api` na imagem Docker devolvia **502** com
`upstream SSL certificate verify error: (20:unable to get local issuer certificate)`.
A leitura natural — bundle de CAs desatualizado na imagem base — está **errada**: o
`openssl` dentro do mesmo contêiner verifica a mesma cadeia com `Verify return code: 0`.
A causa é o `proxy_ssl_verify_depth` do nginx, cujo padrão é **1**, contra uma cadeia de
três níveis (folha → Let's Encrypt YE2 → ISRG Root YE, com cross-sign da ISRG Root X2).
O `openssl` não tem esse limite, e é por isso que ele discorda do nginx.

Cheguei a atualizar o `ca-certificates` no `Dockerfile` antes de medir: **não resolveu**, e
a mudança foi revertida. Vale como lembrete de tratar "verify error" como sintoma, não
diagnóstico — e de conferir se a ferramenta de controle e a de teste têm os mesmos limites.

Confirmado que é anterior a esta tarefa: a `docker/nginx.conf` de `main`, sem nenhuma
alteração minha, reproduz o mesmo 502. O teste de contêiner do CI não pegava porque só
busca a página estática (`curl -sf http://127.0.0.1:8080/`), nunca uma rota de proxy.

**O padrão antigo do nome de artefato deixava passar travessia codificada.** `[^/?#]+`
barra a barra literal, mas `..%2f..%2fetc%2fpasswd` não contém `/` — e o proxy repassa
`${UPSTREAM}${req.url}` cru, sem decodificar. Os 19 nomes que o motor realmente produz
(conferidos na fixture de artefatos da T001) cabem todos em
`[A-Za-z0-9][A-Za-z0-9._-]*`: o `%` fica fora da classe e a exigência de inicial
alfanumérica também recusa `..` e `.oculto`. O teste cobre os dois lados — recusa a
travessia e confirma que `eplusout.err`, `eplusout.sql`, `eplustbl.csv`, `eplustbl.htm` e
`sqlite.err` continuam passando. **Esse buraco é anterior a esta tarefa**; foi encontrado ao
escrever o teste que faltava.

**Produção é mais permissiva que o desenvolvimento, e isso é de propósito.** O
`location /simulation-api/v1/` do nginx é de prefixo: repassa qualquer sub-rota e query
string, e a autorização é a do próprio serviço. O allowlist só existe no `npm run dev`.
Está comentado nos dois arquivos. Não "sincronize" os dois apagando o allowlist.

**O alias `@/` não resolve dentro do que `vite.config.ts` importa.** Vale para
`simulationProxy.ts`, `simulationRoutes.ts` e qualquer módulo que eles puxem. Use caminho
relativo; o `tsconfig.json` já inclui `scripts/`, então o typecheck cobre.

**`gzip_proxied` é fácil de esquecer.** Sem ele o nginx não comprime **nada** que venha de
proxy, mesmo com o tipo listado em `gzip_types`. Só aparece como lentidão.

**O catálogo de estudos do tenant está vazio** (`{"itens":[],"proximo_cursor":null}`), o que
é esperado — nenhum estudo foi criado ainda. A T012 é quem cria o primeiro.
