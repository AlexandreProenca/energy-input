# T003: Tipos e métodos de série temporal no cliente da API

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T003-cliente-series-temporais`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; T001 (fixtures), T002 (allowlist)

---

## 1. Objetivo

Dar ao cliente da API o vocabulário das séries: catálogo de variáveis, série temporal
paginada e os dois erros que só existem aqui — **410** (a série expirou com o `.sql`) e
**422** (variável não registrada, ou chave ambígua). É o que a Fase 2 consome para desenhar
os gráficos.

---

## 2. Escopo

### O que entra

- `src/core/results/types.ts`: `Frequency`, `TimeSeriesPoint`, `SeriesVariable`,
  `TimeSeries`, `CatalogItem`, `VariableCatalog`, `ApiProblem`, `TimeSeriesQuery`.
- `SimulationApi.variables`, `SimulationApi.timeseries` e `SimulationApi.allTimeseries`.
- `SimulationApiError` passa a carregar o corpo `problem+json`; helpers `isSeriesExpired` e
  `seriesCandidates`.
- `src/features/simulation/__tests__/resultsApi.test.ts`: 11 asserções.

### O que NÃO entra (deliberadamente postergado)

- Agregação, reamostragem e conversão de unidades — **T004**.
- `Accept: text/csv`: o proxy de desenvolvimento repassa só `content-type` e
  `idempotency-key`, então habilitar CSV exigiria liberar também o cabeçalho `accept` **e** o
  `Link` da resposta. `proximo_cursor` já resolve a paginação em JSON.
- Seletor de séries e uso das candidatas do 422 — **T012**.

---

## 3. Decisões tomadas

- **Os tipos moram em `src/core/results/`, não em `features/simulation/`.** Quem os consome
  primeiro são os módulos puros da T004 e T005, e `src/core/` não pode importar de
  `src/features/` (AGENTS.md §7). O cliente reexporta, então quem já importa de `api.ts`
  não precisa saber disso.

- **`SimulationApiError` ganhou o corpo estruturado (`problem`).** O `request` achata o erro
  numa mensagem legível, e isso basta para exibir — mas perde `errors[]`, que no 422 de
  ambiguidade traz as **candidatas de chave**. Como o catálogo é por tipo e não devolve
  chave, esse corpo é a única fonte delas. Campo opcional no fim do construtor: nada que já
  usa `SimulationApiError` muda.

- **`allTimeseries` tem teto de páginas e reporta se parou nele.** Uma série anual horária
  cabe numa página só — 8 760 pontos, confirmado contra o serviço —, então o teto só morde
  no caso patológico de um cursor que não avança. Mas devolver meia série em silêncio
  produziria um gráfico plausível e errado; por isso o retorno traz `completa` e `paginas`.

- **Parâmetros ausentes são omitidos, não enviados vazios.** `key=` vazio não é o mesmo que
  `key` ausente: o serviço procuraria a chave `""`. Há teste para isso.

- **Não abrir ADR.** É implementação do que o backlog já decidiu (AGENTS.md §4).

---

## 4. Alterações realizadas

- `src/core/results/types.ts`: novo.
- `src/features/simulation/api.ts`: reexporta os tipos; `variables`, `timeseries`,
  `allTimeseries`; `isSeriesExpired`, `seriesCandidates`; 410 com mensagem própria; o corpo
  do erro preservado em `SimulationApiError.problem`.
- `src/features/simulation/__tests__/resultsApi.test.ts`: novo, 11 testes.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 132 testes (eram 121; +11 nesta tarefa)
- [x] `npm run build`
- [x] **Contra o serviço real**, exercitando os quatro caminhos:

  | Chamada | Resultado observado |
  | --- | --- |
  | `variables` | 349 tipos, 5 na página, `complete: true`, cursor presente |
  | `timeseries` | `ZONE ONE` / `hourly` / `C`, fuso −3, primeiro ponto idêntico ao da fixture |
  | `allTimeseries` | **8 760 pontos em 1 página**, `completa: true`, **365 pontos com `hour: 24`** |
  | 422 | `status: 422`, `isSeriesExpired: false`, candidata extraída do corpo |

---

## 6. Observações / armadilhas para tarefas futuras

**Os 365 pontos com `hour: 24`** — um por dia do ano — são a confirmação em dado vivo da
convenção que a T001 travou na fixture: a hora 24 existe, é o fim do intervalo e pertence ao
dia anterior. A T004 precisa disso ao montar os baldes diários.

**410 é estado de interface, não falha.** Quando a retenção apaga o `.sql`, o painel deve
cair para o resumo permanente com um aviso, não mostrar erro. `isSeriesExpired` existe para
que o chamador não precise comparar `status === 410` espalhado pela interface — e para não
confundir com 404, que é simulação inexistente.

**422 cobre dois casos e só o corpo os separa.** "Variável inexistente nesta simulação" e
ambiguidade de chave usam o mesmo código. `seriesCandidates` devolve as mensagens de
`errors[]`; hoje só há fixture do primeiro caso, porque as execuções bem-sucedidas
disponíveis têm uma zona só. A T012 precisa tolerar a ausência da fixture de ambiguidade —
e quando houver uma execução multizona, vale recapturar.

**Nome de zona em pt-BR é caso de teste, não detalhe.** As zonas deste projeto têm espaço e
acento (`Pavimento Térreo`). Se a codificação do parâmetro escapar, o serviço recebe outra
chave e responde 422 "variável inexistente" — um erro que parece de dado e é de transporte.
Há teste fixando `key=Pavimento+T%C3%A9rreo`.
