# MEMORY.md — em que pé está o projeto

Estado atual, decisões já tomadas e armadilhas que custaram tempo.
Atualizado a cada tarefa, em PR próprio após o merge (`AGENTS.md` §3).

Este arquivo **não** descreve o produto (isso é [`docs/PRD.md`](docs/PRD.md)) nem a
arquitetura (isso é [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)). Ele responde: onde
paramos, no que já esbarramos, e o que não deve ser redescoberto do zero.

---

## Onde paramos

**Versão 0.1.0.** Os três modos de edição funcionam e geram epJSON válido: Assistente
(10 etapas), Editor 3D e Especialista. A integração de simulação envia o modelo, cria a
execução e acompanha o status.

**Em andamento: épico E1 — Dashboards de Análise Energética e Estudos**
([`docs/backlog.md`](docs/backlog.md), 15 tarefas + a T016 fora do épico). Implementa o
item 1 do roadmap do PRD §9 e adota o recurso `/v1/studies` da API para versionar e agrupar
execuções. **T001 concluída**: as fixtures reais estão em `src/core/results/__fixtures__/`.

Decisões de rumo, já fechadas com o usuário:

| Assunto | Escolha |
| --- | --- |
| Gráficos | SVG próprio, sem dependência nova; agregação pura em `src/core/` |
| Modo do estudo | `parametric` (não `iterative`) |
| Lugar na interface | Novo modo **Resultados**, quarto item do cabeçalho |
| Sequência | Dashboards primeiro; estudos depois |

---

## Armadilhas

### `defaultOn` em `outputs.json` é dado morto

`src/templates/outputs/outputs.json` tem um campo `defaultOn` por preset, mas
`grep -rn defaultOn src/ scripts/` só encontra o próprio JSON e
`src/templates/outputs/types.ts`. **Nada lê esse campo.** O conjunto padrão real é a lista
literal em `src/generators/answers.ts`:

```ts
outputs: { selected: ['resumo', 'cargas', 'conta'] },
```

As duas fontes coincidem hoje por acaso. Quem tentar mudar as saídas padrão editando só o
JSON **não muda nada**. A T009 fecha a divergência derivando o padrão de `defaultOn`.

### A execução no serviço está quebrada desde 19/09/2026

Nenhuma simulação conclui: 8 falhas em 6 modelos diferentes, todas com `attempts: 3`,
`err_available: false`, `entries: []` e **zero artefatos**. As três execuções de 16/09
concluíram normalmente. O modelo gerado por este app **passa** em
`POST /v1/models/{id}/validate` e falha igual em `annual` e `design_day`. Sem `.err` e sem
artefato, o EnergyPlus não chegou a rodar — a falha é anterior ao motor.

**Não reporte isso como problema do epJSON sem evidência nova, nem como sucesso da
simulação.** Acompanhamento na T016. O épico de dashboards não está bloqueado: as
execuções de 16/09 continuam com resultados não expirados, e delas saíram as fixtures em
`src/core/results/__fixtures__/`.

### `occupied_*_setpoint_not_met` é ~0 nos modelos que este app gera

`src/generators/hvac.ts` escreve `heating_limit: 'NoLimit'` e `cooling_limit: 'NoLimit'`
em todo `ZoneHVAC:IdealLoadsAirSystem`. Um sistema ideal ilimitado atende o setpoint em
praticamente toda hora, então `occupied_cooling_setpoint_not_met` — que é o
*Comfort and Setpoint Not Met Summary* do EnergyPlus — fica estruturalmente próximo de
zero. **Ele mede controle e dimensionamento, não conforto do ocupante.**

Confirmado em execução real: ambos deram **0 h** nas duas execuções observadas.

Mas `Summary.comfort` tem **três** nomes, não dois — o terceiro é
**`simple_ashrae_55_not_comfortable`**, também em horas, que deu 332,5 h numa das
execuções. Esse é conforto de verdade, é permanente e sobrevive à retenção do `.sql`.

Consequência: "horas de desconforto" (PRD §9) é calculado da série de
`Zone Operative Temperature` contra uma faixa de conforto, e o campo ASHRAE 55 do resumo é
o fallback quando a série expira (410) — **se** os modelos deste app o produzirem, o que
depende de os objetos `People` carregarem modelo de conforto e só uma execução nova
responde.

### O allowlist do proxy é controle só de desenvolvimento

`scripts/simulationProxy.ts` tem um regex que barra rotas não previstas. O
`docker/nginx.conf` de produção usa um `location` de **prefixo** com `proxy_pass`, que
repassa qualquer sub-rota e query string. **Produção é mais permissiva que o
`npm run dev`.** Essa assimetria é anterior ao épico E1; ela precisa ficar escrita, não ser
"corrigida" apagando o allowlist.

O nginx também não tem `gzip_proxied`, sem o qual ele **nunca** comprime resposta vinda de
proxy — mesmo com `application/json` já listado em `gzip_types`.

### `@/` não resolve dentro de `scripts/simulationProxy.ts`

`vite.config.ts` importa esse plugin, e o esbuild carrega a config **antes** de o
`resolve.alias` declarado nela própria existir. Import com alias falha ao resolver; use
caminho relativo. O arquivo está no `include` do `tsconfig.json`, então o typecheck cobre.

### O catálogo de climas do tenant tem dois arquivos, e a busca por nome é exata

`GET /v1/weather?city=São Paulo` devolve lista vazia — não porque a busca esteja quebrada,
mas porque o tenant só tem **Florianópolis (SC)** e **Peixe (TO)** enviados como
`source: "tenant"`. `city=` vazio lista tudo. Qualquer script ou teste que precise de uma
execução `annual` tem que escolher dentro desse acervo, e o `Site:Location` do modelo
deveria acompanhar a estação escolhida para não gerar aviso no motor.

O tipo `Weather` em `src/features/simulation/api.ts` também está defasado: a resposta real
traz `country`, `declared_type`, `hours`, `heating_degree_days`, `cooling_degree_days`,
`degree_day_bases_c`, `license`, `license_url`, `redistributable` e `owner`, nenhum deles
modelado.

### O contrato de séries tem três convenções que enganam

Tudo confirmado com dado real e travado em `src/core/results/__tests__/fixtures.test.ts`:

- **`hour` vai de 1 a 24 e é o fim do intervalo.** A hora 24 ainda pertence ao dia
  anterior, embora seu `timestamp` UTC já esteja no dia seguinte
  (`month: 1, day: 1, hour: 24` ⇄ `2013-01-02T03:00:00Z`, `utc_offset_hours: -3`).
  Tratar 24 como hora 0 do dia seguinte desloca a série inteira em um dia.
- **O ano é o do arquivo climático** (2013 nas fixtures), não o da execução.
- **`frequency` e `aggregation` usam grafias diferentes no mesmo objeto:** `hourly`
  (contrato, minúscula) e `Avg` (motor, capitalizada).

### O catálogo de variáveis não diz o que foi gravado

`/results/variables` é RDD/MDD — o que o modelo *poderia* relatar — e vem paginado em 200.
`Zone Operative Temperature` foi gravada por uma execução e **não** aparece na primeira
página dela. Não existe rota que responda "o que esta execução registrou": a descoberta é
por tentativa, e variável ausente devolve **422** `"variável inexistente nesta simulação"`.
O mesmo 422 cobre ambiguidade de chave — só o corpo distingue.

---

## Perguntas em aberto

- **Retenção do `.sql`.** O contrato diz que `/results/timeseries` responde 410 depois de um
  prazo que ele não numera. As execuções de 16/09 ainda respondem, com artefatos de
  `expires_at: null` — mas isso não define a política.
- **Se `key_value: "*"` gera uma série por zona.** As execuções bem-sucedidas disponíveis
  têm uma zona só, então a fixture não responde — e é também o que impede capturar o 422
  de ambiguidade de chave.
- **Cota de estudo.** Existe `402` no contrato e um endpoint `/v1/usage`, mas o limite por
  tenant é desconhecido. Um estudo de 20 variações pode ser recusado.
- **Estabilidade de `TabelaDeResultados.columns[].key`** (ex.: `end_use::Heating::Electricity`)
  entre versões do motor. Afeta a união de colunas entre páginas na T015.
