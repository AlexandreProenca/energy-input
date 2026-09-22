# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Documentação, comentários, mensagens de commit e UI em **pt-BR**.

## Leitura obrigatória antes de codar

- [`AGENTS.md`](AGENTS.md) — protocolo de trabalho (ciclo tarefa → branch → doc → commit → PR),
  convenções de commit e as regras invioláveis. **Este CLAUDE.md não substitui o AGENTS.md**;
  em caso de divergência, o AGENTS.md vence.
- [`docs/PRD.md`](docs/PRD.md) — escopo e requisitos do produto.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — algoritmos de geometria, superfícies
  compartilhadas, tolerâncias, mapeamento schema → widget e notas do motor.

`MEMORY.md`, `CHANGELOG.md` e `docs/backlog.md` são citados pelo AGENTS.md mas ainda não
existem/estão vazios — crie-os quando o ciclo pedir, não assuma que têm conteúdo.

## Comandos

```bash
npm install
npm run dev          # compila public/schema e sobe o Vite em http://localhost:5173
npm run typecheck    # tsc -b --noEmit (strict, noUnusedLocals/Parameters)
npm test             # Vitest (ambiente node)
npm run build        # schema + tsc --noEmit + bundle Vite em dist/
npm run schema       # regenera public/schema/<versão>/schema.json a partir de schema/<versão>/
npm run fetch-schema -- v26.1.0   # extrai Energy+.schema.epJSON do release oficial do EnergyPlus
npm run climates     # regenera src/templates/climates/br-cities.json
docker compose up --build         # container Nginx de produção em http://localhost:8080
```

Portões locais antes de qualquer PR (mesma ordem do CI): `npm run typecheck && npm test && npm run build`.

Um teste isolado:

```bash
npx vitest run src/core/geometry/__tests__/sharedSurfaces.test.ts -t "lajes entre pavimentos"
```

Validações opcionais que exigem recursos externos (nunca rodam no CI):

```bash
EPLUS_DIR=/Applications/EnergyPlus-26-1-0 EPW=cidade.epw npm run eplus-check
CASE=planta-ambientes EPLUS_DIR=… EPW=… npm run eplus-check   # um cenário só
npx tsx scripts/simulation-api-check.ts                        # exige npm run dev em outra aba
```

`npm run schema` só reescreve o destino quando o `.epJSON` de origem é mais novo; apague
`public/schema/<versão>/schema.json` para forçar a regeneração.

## Arquitetura

SPA 100% client-side (React 18 + TS + Vite 6 + Zustand + Tailwind). Não há backend: o único
componente de servidor é o proxy de desenvolvimento em `scripts/simulationProxy.ts`, plugin
Vite que encaminha `/simulation-api/v1/*` para `https://homolog.ee.dev.br`.

**Uma única fonte da verdade reativa:** o documento epJSON em `store/documentStore.ts`
(com undo/redo e coalescência de 800 ms). Três modos de edição escrevem no mesmo documento —
Assistente (`features/wizard`), Editor 3D (`features/geometry`) e Especialista
(`features/expert`) — e o modo ativo vive em `store/uiStore.ts`.

Fluxo do Assistente:

```
WizardAnswers  →  generators/*  →  fragmentos epJSON  →  compose.ts (mergeFragments)
                                                              ↓
                                          core/sync/wizardSync.ts (planWizardSync)
                                                              ↓
                                                      documentStore.doc
```

Camadas:

- **`src/core/`** — domínio puro, framework-free, testado no Vitest. `epjson/` (tipos e ops
  imutáveis, rename com propagação), `schema/` (SchemaIndex e mapeador fragmento JSON-Schema →
  `FieldSpec`), `validation/` (Ajv 8 com mensagens pt-BR, cross-refs, nomes duplicados),
  `weather/` (parsers EPW/DDY), `sync/`, `geometry/` (modelo de leitura, frames, edições puras,
  superfícies compartilhadas, resumo U/CT).
- **`src/generators/`** — funções puras `(answers) → fragmento epJSON`; `compose.ts` orquestra.
  `geometry/boxGeometry.ts` (shoebox) e `geometry/floorPlan.ts` (planta 2D por ambientes) são
  intercambiáveis via `answers.geometry.mode`.
- **`src/templates/`** — catálogos como **dados** (JSON + `types.ts` ao lado). Adicionar cidade,
  material, preset, vidro, porta, uso ou preset de saída é editar JSON, não código.
- **`src/store/`** — Zustand: `documentStore`, `wizardStore`, `schemaStore`, `uiStore`,
  `persistence.ts` (autosave em localStorage, chave `energy-input:autosave:v1`),
  `resetProject.ts`.
- **`src/features/`** — UI por módulo; `ExpertShell`, `GeometryEditor` e `SimulationDialog` são
  carregados com `lazy()` (evite importá-los estaticamente do `App.tsx`).

Alias `@/` → `src/`.

### Pontos que exigem cuidado

- **`planWizardSync` (`src/core/sync/wizardSync.ts`)** guarda um hash FNV-1a por objeto escrito
  pelo assistente. Objeto que o usuário editou e o assistente quer mudar vira **conflito**
  (`ConflictDialog`), nunca sobrescrita silenciosa; objeto criado pelo usuário nunca é removido.
  Qualquer mudança em geradores mexe indiretamente aqui — rode `wizardSync.test.ts`.
- **`core/geometry/sharedSurfaces.ts`** pareia faces por contorno em coordenadas globais
  (origem + rotação da zona, tolerância 0,1 mm, normais opostas). O epJSON mantém **duas**
  `BuildingSurface:Detailed` recíprocas; o 3D mostra **um** elemento físico. Editar construção,
  camadas ou abertura de um lado precisa sincronizar o outro em ordem inversa. Testes de
  geometria exigem contraprovas (falso positivo, orientação reversa, tolerância).
- **Escrita de geometria honra `GlobalGeometryRules`** (starting corner, direction,
  Relative/World) — não presuma a ordem dos vértices.

## Regras invioláveis (resumo; íntegra no AGENTS.md §7)

- **`src/core/` não importa React, Zustand, Three.js nem DOM.** Puro e determinístico.
- **`schema/<versão>/Energy+.schema.epJSON` é vendorizado do release oficial do EnergyPlus e
  nunca é editado à mão.** Use `npm run fetch-schema`; o derivado servido é gerado por
  `npm run schema`.
- **Nenhum segredo no bundle.** `SIMULATION_API_TOKEN` existe apenas em `.env.local` para o
  proxy Vite em loopback — nunca com prefixo `VITE_`. Credenciais digitadas pelo usuário ficam
  só em memória volátil, jamais em `localStorage`/`sessionStorage`.
- **Marca:** o produto é **Energy Input** ("Arquivos epJSON para EnergyPlus"). Nunca
  "EnergyPlus API" nem a marca do EnergyPlus como nome próprio.
- **Doc de tarefa concluída em `docs/tasks/` é histórico** — não reescreva para refletir o presente.
