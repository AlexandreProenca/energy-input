# Changelog

Todas as mudanças relevantes deste projeto, por tarefa e por versão.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versionamento conforme [SemVer](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado

- Script opcional `scripts/capture-results-fixtures.ts`: captura de uma execução concluída
  (`SIMULATION_ID=sim_…`) ou executa uma simulação **anual** nova, e grava em
  `src/core/results/__fixtures__/` o formato real de resumo, catálogo de variáveis, séries
  temporais e artefatos, com identificadores da conta higienizados. Base factual do épico
  de dashboards: tipos e gráficos passam a ser escritos contra dado observado, não contra a
  prosa do OpenAPI. (`Refs: T001`)
- `src/core/results/__tests__/fixtures.test.ts`: 12 asserções travando o contrato
  observado — a hora 24 como fim do intervalo, o ano vindo do arquivo climático, o catálogo
  de tipos paginado, o 422 de variável não registrada e os três indicadores de conforto do
  resumo permanente. (`Refs: T001`)
- `docs/backlog.md`: quadro do épico E1 — Dashboards de Análise Energética e Estudos,
  com 15 tarefas, dependências e as armadilhas levantadas no contrato da API.
- `CHANGELOG.md` e `MEMORY.md`, exigidos pelo `AGENTS.md` §3 e até então inexistentes.
  (`Refs: T001`)
- `src/core/results/__fixtures__/README.md`: proveniência das fixtures, o que foi alterado
  em relação à resposta original e o aviso de que `_pontos_na_pagina_original` é campo
  sintético do script, não da API. (`Refs: T001`)
- Guarda de regressão da higienização: varre **todos** os arquivos do diretório de fixtures
  — inclusive os que o teste não importa — e recusa identificador real da conta, `owner`
  de tenant ou `request_id` não substituído. Também verifica que os próprios marcadores
  respeitam os padrões de identificador do contrato. (`Refs: T001`)

### Documentado

- `docs/DEVELOPMENT.md`: a execução no serviço **não conclui desde 19/09/2026** — 8 falhas
  em 6 modelos diferentes, sem `.err` e sem artefato nenhum, enquanto o modelo gerado aqui
  passa em `POST /models/{id}/validate`. Substitui o registro anterior de que nenhuma
  simulação jamais tinha concluído. Acompanhamento na T016 do backlog. (`Refs: T001`)

### Corrigido

- `AGENTS.md` §2 e §3 diziam `docs/tasks/NNN-slug.md`, enquanto o template da tarefa, o
  nome da branch e o rodapé do commit usavam `TNNN`. Padronizado em `TNNN`. (`Refs: T001`)
- Dois marcadores de higienização tinham corpo ULID curto (`mdl_` com 25 e `mv_` com 24
  caracteres, contra os 26 do contrato), contrariando a promessa de que casariam com os
  padrões. Ainda não haviam vazado para nenhuma fixture. (`Refs: T001`)
- `scripts/capture-results-fixtures.ts` não removia aspas ao ler `.env.local`, divergindo
  do `loadEnv` do Vite que o proxy usa sobre o mesmo arquivo: `TOKEN="abc"` viraria um
  Bearer com aspas e daria 401 sem explicação. O token também passou a entrar no mapa de
  higienização, por precaução. (`Refs: T001`)

## [0.1.0] — 2026-09-22

Primeira versão com os três modos de edição e a integração de simulação.

### Adicionado

- Assistente guiado de 10 etapas, gerando epJSON completo a cada resposta.
- Editor 3D com espessura real de materiais, paredes e lajes compartilhadas, aberturas
  entre zonas térmicas e elevação 2D interativa.
- Modo Especialista dirigido pelo schema oficial do EnergyPlus 26.1, com validação Ajv
  contínua e editor CodeMirror sincronizado.
- Planta 2D por ambientes, com divisão de paredes em encontros em T.
- Integração com a API de simulação em homologação: upload do modelo, execução,
  acompanhamento de status, diagnósticos e artefatos.
- Imagem Docker multi-stage servindo o build estático por Nginx.
