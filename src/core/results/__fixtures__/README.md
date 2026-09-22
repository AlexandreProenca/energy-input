# Fixtures de resultados

Respostas **reais** da API de simulação (`https://homolog.ee.dev.br/v1`), capturadas por
[`scripts/capture-results-fixtures.ts`](../../../../scripts/capture-results-fixtures.ts)
a partir de uma execução `annual` concluída. Elas existem para que os tipos e os gráficos
do épico E1 sejam escritos contra dado observado, não contra a prosa do OpenAPI.

O contrato que elas travam está em
[`../__tests__/fixtures.test.ts`](../__tests__/fixtures.test.ts). Se o serviço mudar de
forma, a quebra aparece ali — antes de aparecer como gráfico silenciosamente errado.

## Como regravar

```bash
SIMULATION_ID=sim_… npx tsx scripts/capture-results-fixtures.ts   # execução já concluída
npx tsx scripts/capture-results-fixtures.ts                        # executa uma anual nova
```

## O que foi alterado em relação à resposta original

Nada além disto — números, nomes de campo e nomes de objeto do modelo estão byte a byte:

- **Identificadores da conta** (`sim_…`, `mdl_…`, `mv_…`, `wx_…`) trocados por marcadores
  fixos que ainda casam com os padrões do contrato, para que os testes possam validar
  formato sem versionar identificadores reais.
- **`request_id`** trocado por `<request_id>`.
- **Séries recortadas** a 48–72 pontos. Uma página horária anual tem 8 760 pontos e passa
  de 1 MB; a fixture fixa formato, não volume.

## Campo sintético

`_pontos_na_pagina_original` **não existe na API**. É adicionado pelo script para registrar
quantos pontos a página realmente tinha antes do recorte — é o que permite ao teste afirmar
que o ano inteiro cabe numa única página. Todo campo inventado aqui leva o prefixo `_`;
qualquer outro nome veio do serviço.
