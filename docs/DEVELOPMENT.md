# Energy Input — development notes

Web app (pt-BR UI) for creating/editing EnergyPlus **epJSON** files. Frontend-only: React 18 + TypeScript + Vite 6, Zustand, ajv 8, CodeMirror 6, react-three-fiber.

```bash
npm install
npm run dev          # builds public/schema from schema/<version>/ then starts Vite
npm test             # vitest: schema mapping, validation, generators, wizard sync
npm run build
```

## Schema (source of truth)

- `schema/26.1/Energy+.schema.epJSON` — vendored from the **EnergyPlus v26.1.0** release package. It is generated at EnergyPlus build time and is *not* in the GitHub repo, so `npm run fetch-schema -- v26.1.0` extracts it from the release tarball.
- `npm run schema` (runs automatically) writes `public/schema/<version>/schema.json`: the same JSON Schema minus `legacy_idd`, plus `field_order` / `field_labels` taken from it. Several versions can live side by side; the newest is the default. Users can also upload a schema at runtime (Expert mode → "Schema").
- Validation compiles each object type's sub-schema lazily in ajv (the full schema takes >1 s to compile; it has no `$ref`s, so sub-schemas are self-contained).

## Layout

```
src/core/          framework-free, unit tested
  epjson/          document types + immutable ops (rename w/ propagation, clone, diff, ordering)
  schema/          SchemaIndex, JSON-Schema fragment → FieldSpec mapper, slim schema
  validation/      ajv wrapper with pt-BR messages, cross-reference + duplicate-name checks
  weather/         EPW parser, DDY (IDF) parser, design-day/ground-temperature estimates
  sync/            wizard ⇄ document merge (ownership hashes, conflict detection)
  geometry/        read model (frames, rectangles, zones), pure edits (openings, zone box resize,
                   construction layers/thickness with "all users" vs "only this element" scope), U/CT summary
src/generators/    pure step generators: (answers) → epJSON fragment; compose.ts merges them
  geometry/boxGeometry.ts   isolated box geometry (swap for a polygon tool later)
src/templates/     swappable DATA: cities (built by `npm run climates`), materials & construction
                   presets, colors, glazing, building uses (schedules), output presets
src/store/         zustand: schema, document (undo/redo), wizard, ui, autosave (localStorage)
src/features/      wizard/ (steps, illustrations), geometry/ (Editor 3D), expert/ (sidebar, list, form, fields, JSON), preview/ (3D)
scripts/           build-schema, fetch-schema, build-climates, eplus-check
```

## Field kind → widget (Expert mode)

| Schema pattern | FieldSpec kind | Widget |
|---|---|---|
| `type: number` / `integer` | `number` / `integer` | numeric input (pt-BR comma), unit, range hint |
| string, no enum | `text` | text input |
| enum `"" / Yes / No` | `yesno` | Padrão · Sim · Não |
| other enum | `enum` | select (combobox when >12 options) |
| `anyOf` number \| Autosize/Autocalculate | `autoNumber` | Padrão · Auto · Valor + number |
| `anyOf` number \| string | `numberOrText` | free input, numbers coerced |
| `anyOf` integer enum \| `""` | `numericEnum` | select |
| `data_type: object_list` | `reference` | searchable picker from document names, "Criar …", dangling warning |
| object_list naming `reference-class-name` | `classReference` | picker of object type names |
| `data_type: external_list` | `externalList` | free text + suggestions |
| `type: array` + `items` | `array` | editable table: add/remove/reorder, paste from spreadsheet |

## Wizard ⇄ Expert

Every wizard answer has a default and the whole document is regenerated on each change. `planWizardSync` applies it without clobbering manual edits: it stores a hash of every object the wizard wrote; objects the user changed are kept silently when the wizard's version didn't change, and raise a "Manter / Sobrescrever" dialog when it did. Objects the user created are never removed. Opening or creating a file in Expert mode unlinks the wizard.

**A removal never leaves a dangling reference (T023).** When a wizard object stops being generated — the glazing construction after the user picks another glass, for instance — it is removed only if nothing that stays still points at it. Otherwise it is *retained*, together with whatever it references in turn (the construction keeps its glazing material), and stays owned by the wizard so a later sync removes it once nothing points at it anymore. The reference scan is schema-agnostic (every string value, upper-cased, since EnergyPlus compares names case-insensitively): a coincidental match only keeps an object that could have gone; a missed reference is a `Fatal` in EnergyPlus.

This is what broke a real simulation: windows placed in the 3D editor with the wizard's glass kept pointing at a construction the sync had deleted after the glass was changed, and EnergyPlus stopped at `GetSurfaceData` with `invalid construction_name`.

**User-drawn windows follow the wizard's glass (T024, [ADR-0002](adr/0002-janelas-acompanham-o-vidro-do-assistente.md)).** Before each sync, `acompanharVidro` moves every *user-owned* window whose construction is the wizard's previous glass to the new one, frame included (a customized frame stays). A window with any other construction is the user's specific choice and is left alone — that is how "edit one window in Expert mode" stays stable across later wizard changes. Wizard-owned windows are skipped: the generator rewrites them, and touching them would change their hash and raise a false conflict. Windows pointing at a catalog glass that no longer exists in the document (the damage from the pre-T023 bug) are repaired to the current glass. The store announces every change with a toast; it is the one announced exception to "never silently overwrite user objects". Note that the Apartamento envelope preset switches the glass by itself — that is how the original incident happened without the user ever opening the Windows step.

**Dangling references in the window chain are errors, not warnings.** `checkCrossReferences` is best-effort, because EnergyPlus synthesizes some names the schema index cannot know (ZoneList-expanded thermostats, auto-created spaces), so a missing target is a warning by default. For `ConstructionNames`, `MaterialName` and `WindowFrameAndDividerNames` it is an error, and the simulation dialog blocks on it. The list is measured: across the 752 EnergyPlus 26.1 example files converted to epJSON (all of which run), those lists carry 56 893 references and none dangling, while "any required field is an error" flagged 25 valid files. Widening the list requires measuring again.

## Editor 3D

Third mode, editing the same document. `core/geometry/model.ts` reads `BuildingSurface:Detailed` (and `Wall/RoofCeiling/Floor:Detailed`) plus `FenestrationSurface:Detailed`, building a frame per surface (u right, v up, n outward, seen from outside) so rectangles and openings get 2D coordinates. Writes honor `GlobalGeometryRules` (start corner, direction, Relative/World).

- Selection by clicking meshes (drag-aware) or the element tree; walls are extruded inward by their construction thickness with real holes for openings.
- Surfaces: construction picker (document + library, imported on demand), layer editor (material, thickness, order); shared constructions ask whether to edit all users or copy for this element. Thickness changes create material variants ("… 19 cm").
- Walls/zones: box-shaped zones can be resized (optionally all floors with the same footprint; height shifts floors above); openings keep size and are repositioned proportionally.
- Openings: window / door / glass door, numeric position (from the wall's lower-left seen from outside) or drag/resize on the SVG elevation (5 cm snap), overlap/out-of-wall checks.
- Door templates live in `src/templates/doors/`.

EnergyPlus surfaces have no thickness: thickness only affects heat transfer through the construction.

## Verifying generated files with EnergyPlus

`scripts/eplus-check.ts` generates several variants and runs them through a local EnergyPlus install, failing on Severe/Fatal errors (dev only — the app never runs EnergyPlus):

```bash
EPLUS_DIR=/Applications/EnergyPlus-26-1-0 EPW=path/to/city.epw npm run eplus-check
```

All variants (1–3 floors, all presets, per-facade windows, setbacks, year-wrapping run period, design-day-only, and a document edited with the 3D editor operations: resized zones, door/glass door/window added, per-wall thickness) complete with 0 severe errors on EnergyPlus 26.1.0.

## Docker

Build multi-stage: `node:20-alpine` gera o `dist/` (schema + typecheck + build do Vite), servido depois por `nginx:1.27-alpine`. A imagem final não carrega Node nem `node_modules` — só os arquivos estáticos e o nginx (~56 MB).

```bash
docker compose up --build       # http://localhost:8080
# ou, sem compose:
docker build -t energy-input .
docker run -p 8080:80 energy-input
```

Não há variáveis de ambiente nem backend: é um SPA 100% estático, e o schema do EnergyPlus é gerado dentro da imagem a partir de `schema/26.1/Energy+.schema.epJSON` (por isso esse arquivo vendorizado precisa estar no contexto de build). `docker/nginx.conf` cuida de gzip, cache longo e imutável para `/assets/*` (nomes com hash do Vite), cache curto com revalidação para `/schema/*` e `no-cache` para `index.html`, além de um fallback de SPA (`try_files … /index.html`) — hoje sem uso real, já que não há roteamento client-side, mas inofensivo e já pronto caso isso mude.

Para atualizar a versão do EnergyPlus na imagem, rode `npm run fetch-schema -- vXX.Y.0` localmente (grava em `schema/<versão>/`) antes do build — o Dockerfile não busca nada da rede.

## Known simplifications

- Bioclimatic zones (NBR 15220-3) per city are approximate and user-adjustable; NBR 15575 badges are indicative only.
- Santa Maria, Caxias do Sul and Pelotas DDY files lack ASHRAE conditions; their design days are estimated from the EPW.
- `Site:GroundTemperature:BuildingSurface` uses a damped monthly mean clamped to 15–25 °C (no slab preprocessor).
- Facade names (Norte/Sul/…) follow model axes; with a non-zero north axis they are rotated.

## Planta 2D por ambientes

Em **Assistente → Geometria → Planta 2D por ambientes**, o usuário pode criar
contornos clicando no plano cartesiano ou digitando coordenadas X/Y em metros.
A paleta oferece retângulo, quadrado, triângulo, formato L e hexágono, com
largura e altura configuráveis. Arrastar para a planta posiciona a figura pelo
canto inferior esquerdo; clicar na paleta insere no centro da vista (alternativa
para teclado e dispositivos de toque). A figura entra como rascunho.

Em **Selecionar / mover**, qualquer ambiente pode ser selecionado no desenho ou
na lista, mesmo com outras edições pendentes. Arraste um vértice para mudar o
contorno, uma linha para deslocar seus dois extremos ou o interior para mover o
ambiente inteiro. Linhas coincidentes podem ser escolhidas pela lista
**Selecionar linhas do ambiente** após selecionar a zona desejada. O movimento
atinge o ambiente selecionado; os vizinhos não são deslocados automaticamente. O passo da grade controla o ajuste. Selecione um
ponto ou linha e use as setas (Shift = 10 passos) ou Delete. Tab + Enter também seleciona
os pontos. **Adicionar pontos** retoma o desenho livre. **Mover vista**, zoom e
**Enquadrar planta** controlam a navegação.

**Desfazer edição / Refazer edição** (Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z com o plano
focado) operam no rascunho da planta inteira, inclusive após trocar de ambiente; um arraste é uma única operação. Esc cancela um
arraste em curso. Os pontos podem ser corrigidos ou removidos antes de
**Salvar planta**.
O fechamento liga o último ponto ao primeiro. O salvamento conjunto valida todos os ambientes antes de atualizar o epJSON
e a prévia. **Cancelar alterações** descarta todas as edições pendentes. **Abrir maquete 3D e editar materiais** abre o editor existente.

- O polígono representa o limite geométrico da zona: área pelo contorno, perímetro
  pela soma dos segmentos, volume pela área × altura. Espessuras de materiais
  não descontam área nem deslocam os pontos.
- Cada ambiente gera uma zona térmica por pavimento. Nesta versão, todos os
  pavimentos repetem a mesma planta e altura. Cobertura plana, sem furos internos.
- Contornos simples podem ser côncavos ou inclinados. Coordenadas: −500 a 500 m;
  3–100 vértices; segmentos ≥ 1 cm; área ≥ 0,01 m². O gerador rejeita cruzamentos,
  contatos consigo mesmo, sobreposições entre ambientes e nomes duplicados.
- Paredes compartilhadas são divididas nos encontros em T e pareadas entre
  zonas, com construções em ordem inversa. Portas e janelas não são geradas por padrão; são adicionadas pelo usuário no
  editor 3D. A geração por percentual exige ativação explícita na etapa Janelas
  e só atua em paredes externas. Fachadas inclinadas usam a direção cardinal mais próxima.
- Pisos e coberturas mantêm um polígono por ambiente, sem diagonais de subdivisão
  visíveis. A triangulação para desenho respeita concavidades, e as áreas no
  editor 3D são calculadas pelos polígonos reais. A renderização diferencia a
  profundidade de faces coplanares na junção entre paredes e cobertura.
- Para projetos vinculados à planta, dimensões são editadas no 2D; materiais
  continuam no 3D. A proteção de conflitos já existente continua em vigor.
- Projetos antigos sem `geometry.mode` continuam no modo de bloco retangular.
  Ambientes salvos são incluídos no autosave existente. O contorno em edição é
  um rascunho local: salve antes de mudar de etapa ou de modo.

Implementação: `src/generators/geometry/floorPlan.ts` (validação e extrusão),
`src/features/wizard/steps/FloorPlanEditor.tsx` (editor), `compose.ts` (integração).

Validação: `npm test`, `npm run typecheck` e build Vite. O caso
`planta-ambientes` de `scripts/eplus-check.ts` exercita uma sala em L, dois
ambientes adjacentes e dois pavimentos no EnergyPlus real. Execute com
`CASE=planta-ambientes EPLUS_DIR=… EPW=… npm run eplus-check`.
Na validação local com EnergyPlus 26.1: zero Severe/Fatal; um aviso porque a
localização do EPW de teste substitui a cidade configurada no projeto.


### Paredes e lajes compartilhadas

`sharedSurfaces.ts` compara contornos em coordenadas globais, aplicando as origens
(inclusive cota Z) e rotações das zonas. Reconhece vértices em ordem inversa e
inícios diferentes, removendo pontos colineares redundantes, com tolerância de
0,1 mm. Exige zonas distintas, contornos coincidentes e normais opostas; não
combina faces apenas próximas, da mesma zona ou com correspondência ambígua.
Encontros parciais de paredes da planta são divididos antes pelo gerador.

O epJSON mantém duas faces térmicas reciprocamente ligadas por `Surface`, pois
cada zona precisa de seu fechamento. O editor 3D e a prévia exibem um único
elemento físico. Na visualização com espessura, o elemento compartilhado é
centrado na interface e tem uma única espessura total. Pode ser selecionado pelos
dois lados na árvore, identificados como compartilhados. O filtro de pavimentos
considera todas as zonas na mesma cota e não elimina a laje intermediária.

A troca de construção ou edição de camadas em um lado sincroniza o outro, em
ordem inversa, tanto na edição individual como na edição de todos os usuários de
uma construção. A detecção visual por vértices também funciona em documentos
sem referência de adjacência; ela não reescreve automaticamente as condições
térmicas de arquivos importados.

Testes: contagem de elementos físicos, espessura única, paredes em T, lajes,
rotações/translações, contornos colineares, falsos positivos e edição de materiais.
O caso EnergyPlus `planta-ambientes` agora também modifica as camadas de uma
parede e uma laje compartilhadas antes de simular.


### Reset da edição

O botão **Resetar edição** no cabeçalho pede confirmação e considera a origem
do projeto. Uploads guardam uma cópia independente do documento e do nome
originais; o reset restaura essa cópia e abre o modo Especialista. Projetos
criados no aplicativo voltam às respostas padrão e ao primeiro passo do
assistente. Rascunhos locais são descartados pela remontagem dos editores;
histórico, seleções e conflitos pendentes também são limpos. Abrir outro
arquivo ou iniciar um projeto estabelece uma nova sessão de edição.

A origem e a cópia do upload acompanham o autosave em localStorage. Sessões
antigas sem essa cópia usam o primeiro estado recuperado como referência,
com aviso explícito na confirmação de reset. O upload original dessas sessões
não pode ser reconstruído. Testes em `src/store/__tests__/resetProject.test.ts`
cobrem reset repetido, isolamento da cópia, restauração do autosave, upload
vazio, migração de sessão antiga e retorno ao assistente.


### Portas e janelas entre zonas térmicas

No Editor 3D, selecione um trecho retangular de parede compartilhada e use
**Janela**, **Porta** ou **Porta de vidro**. A operação cria duas
`FenestrationSurface:Detailed` com referências recíprocas, vértices coincidentes
em coordenadas globais e orientação oposta. A face vizinha usa coordenadas
locais da própria zona, incluindo origem e rotação, e camadas invertidas.

Mover, redimensionar, trocar tipo/material ou excluir no Editor 3D atualiza
as duas faces numa única edição. A malha 3D mostra apenas uma abertura,
centralizada na espessura da parede; selecionar qualquer face destaca essa
mesma malha. Sobreposições são verificadas nos dois lados. Em encontros com
três ou mais zonas, cada trecho de parede já dividido pela planta conecta
as duas zonas adjacentes; a abertura deve caber nesse trecho. Paredes sem
face vizinha identificada continuam exigindo correção da geometria antes
da inserção de aberturas internas.

Os testes de superfícies compartilhadas cobrem três tipos de abertura,
múltiplas zonas, transformações locais, edição pelo lado oposto e exclusão.
O caso `planta-ambientes` do smoke test EnergyPlus inclui esses três tipos
de abertura interna, além das edições de camadas nas paredes e lajes.


### Presets Casa e Apartamento (etapa 5)

A etapa **Materiais** oferece Casa (`padrao`, ID mantido para compatibilidade)
e Apartamento (`apartamento`), preservando cartões, cortes de camadas, cores
e pré-visualização. Os presets antigos continuam disponíveis na biblioteca
do Editor 3D e em projetos salvos. O revestimento cerâmico ou vinílico é
aplicado a todos os pisos e às faces inversas das lajes entre pavimentos.

Apartamento usa bloco de concreto equivalente de 14 cm rebocado, laje de
concreto de 12 cm, contrapiso, acabamento escolhido e gesso no teto. Ambos
os presets disponibilizam a porta interna semi-oca da biblioteca. A janela
do apartamento usa `WindowMaterial:Glazing` com espessura real de 0,004 m e
`WindowProperty:FrameAndDivider` para o PVC; as propriedades óticas e térmicas
são valores indicativos, não dados certificados de fabricante. Nenhuma
abertura é inserida automaticamente pela seleção do preset.

Ao selecionar Apartamento, os contatos externos do primeiro piso e último
teto passam a `adjacent`: lajes adiabáticas representando unidades vizinhas
fora do modelo. Essa aproximação é explicada na interface e não representa
uma simulação explícita do vizinho. Pavimentos incluídos no modelo continuam
com pares `Surface` e construções inversas. O usuário pode mudar o contato
para solo, pilotis ou cobertura externa nas etapas 4 e 5. Casa repõe solo e
cobertura externa; selecionar um preset não muda a opção de janelas automáticas.

Validação: testes `residentialPresets.test.ts` cobrem planta e caixa, contato
adiabático, pares internos, revestimentos, espessura do vidro, esquadria e
troca de preset. O smoke test `CASE=apartamento` usa dois pavimentos, ambientes
adjacentes, janela PVC e porta interna semi-oca entre zonas.


### Simulação pela API de homologação

O botão **Simular modelo** (ícone de executar no cabeçalho e ação na revisão)
abre a integração com `https://homolog.ee.dev.br/v1`, conforme o OpenAPI
consultado em 22/09/2026. Envia a cópia atual do documento como multipart
`file` em `/models`, usa `versao.id` em `/simulations` e preserva o mesmo
`Idempotency-Key` quando uma solicitação precisa ser retomada. A cópia enviada
é independente das edições posteriores. Consultas de status são sequenciais
a cada cinco segundos, param nos estados terminais e pausam em erro de rede
ou autenticação; **Atualizar status** retoma o acompanhamento.

A conexão consulta `/engines`; somente versões compatíveis com o modelo
podem ser escolhidas. Execução climática (`annual`, inclusive o período
limitado pelo RunPeriod do modelo) exige seleção de `weather_id` no catálogo
ou upload EPW com licença declarada. `design_day` dispensa EPW. Os resultados
incluem summary, errors, logs e artifacts. Um erro em um desses recursos não
esconde os demais. Também é possível consultar uma execução pelo ID.

Desenvolvimento: copie `.env.example` para `.env.local` e configure
`SIMULATION_API_TOKEN`. O middleware Vite usa essa credencial apenas em
requisições locais (loopback e Host localhost/127.0.0.1), recusa origens
cruzadas e nunca a inclui no bundle. Não use `VITE_` para segredos. Na versão
Docker/nginx, o usuário informa Bearer no painel (somente memória); o proxy
não tem credencial compartilhada. Um futuro login de aplicação poderá
substituir esse campo. O segredo não entra no autosave nem em sessionStorage.

O proxy `/simulation-api/v1` elimina a dependência de CORS no serviço. Em
downloads, transforma o 302 em `{download_url}`; o navegador abre o link
pré-assinado sem enviar Authorization ao armazenamento. O link não é
persistido. Credenciais e conteúdo dos modelos não são registrados em logs.
O identificador da execução e o pedido idempotente ficam em sessionStorage
para retomar após recarregar a mesma aba. `vite preview` serve apenas os
arquivos estáticos; use `npm run dev` ou Docker/nginx para a integração.

Validação automática: testes de transporte e ciclo de vida; smoke test real
(opt-in) `node --import tsx scripts/simulation-api-check.ts` contra o Vite
local com credencial configurada. Esse script cria um modelo sintético,
verifica idempotência e acompanha a execução.

**Estado da execução no serviço (23/09/2026).** Autenticação, catálogo, upload,
criação, repetição idempotente, validação de modelo **e execução** funcionam. De 19/09 a
23/09 nenhuma simulação concluiu:

| Data | Tipo | Resultado |
| --- | --- | --- |
| 16/09 | design_day e annual | 3 execuções `succeeded` (2,0 s a 24,9 s) |
| 19/09 a 23/09 | annual e design_day | todas `failed`, em modelos de origens diferentes |

A assinatura era sempre a mesma: `attempts: 3`,
`failure_reason: "tentativas esgotadas: a execução falhou repetidamente"`,
`err_available: false`, `entries: []`, `fatal: null` e **zero artefatos**.

**A causa estava no serviço, antes do motor** (T016): a imagem de contêiner do EnergyPlus era
removida toda madrugada por uma rotina de limpeza do servidor, e o processo de simulação não
tinha permissão para baixá-la de volta. A criação do contêiner falhava em menos de um
segundo, e o serviço reportava `motor_indisponivel`. **O EnergyPlus nunca chegou a rodar**,
e é por isso que não havia `.err`. O epJSON gerado aqui passava — e continua passando — em
`POST /v1/models/{id}/validate`.

**Como reconhecer se voltar:** falha em menos de um segundo por tentativa,
`duracao_segundos: 0.0` e nenhum artefato, **em qualquer modelo**. Isso é o serviço, não o
epJSON. Um epJSON inválido chega ao motor e deixa `.err` com `Severe`/`Fatal`.

O conserto foi aplicado na instância e ainda precisa ir para o repositório do serviço (T022).
O download de artefato é um defeito separado, de assinatura de URL (T021).

### Dashboards de resultados

O modo **Resultados** (`src/features/results/`, carregado com `lazy()`) desenha três painéis
a partir de uma execução concluída: **consumo anual**, **temperatura operativa** e **horas de
desconforto**. Fecha o item 1 do roadmap do PRD §9.

As séries vêm da API **em JSON**, por `GET /v1/simulations/{id}/results/timeseries` — uma
variável por chamada, paginada por `proximo_cursor`. Nada de `.csv`/`.sql` é baixado nem
interpretado no navegador. Dois detalhes do contrato custam caro quando esquecidos:

- **`hour` vai de 1 a 24 e é o FIM do intervalo.** A hora 24 pertence ao dia anterior, não ao
  seguinte. No carpete, `row = hour - 1`, então a linha 0 é a madrugada e fica no **topo**.
- **`frequency` é a grafia do contrato (`hourly`) e `aggregation` é a do motor (`Avg`).** Não
  são o mesmo vocabulário.

Toda a matemática mora em `src/core/results/` — `series.ts` (normalização e agregação),
`comfort.ts` (horas fora da faixa, fixa e adaptativa), `units.ts`, `plot.ts` (escalas,
caminhos SVG e células do carpete) e `rotulos.ts` (dicionário pt-BR). Os componentes em
`charts/` **recebem dados já agregados e não calculam nada**: o Vitest roda em
`environment: 'node'`, sem jsdom, então lógica dentro de `.tsx` não tem como ser testada.

Estados que o painel precisa distinguir, e que não são erro: execução em dias de projeto (não
há ano para agregar), saída não solicitada antes de simular (**422**), série expirada pela
retenção do `.sql` (**410** — o resumo permanente continua valendo) e medidor **registrado
marcando zero**, que é resultado do modelo e não falta de saída.

**Sobre os indicadores de conforto do resumo.** `occupied_heating_setpoint_not_met` e
`occupied_cooling_setpoint_not_met` são **estruturalmente zero** nos modelos deste
aplicativo, porque `src/generators/hvac.ts` escreve `NoLimit` — um sistema ideal ilimitado
sempre atende o setpoint. Eles medem controle, não conforto.
`simple_ashrae_55_not_comfortable` **não** é zero: o modelo padrão do gerador, rodado
localmente em anual, reporta 7 587 h. É ele o fallback quando a série expira. Habilitar um
modelo de conforto detalhado (Fanger, Pierce) no `People` exigiria três agendas que o gerador
não escreve — `work_efficiency`, `clothing_insulation` e `air_velocity` —, e sem elas o
EnergyPlus para com `Fatal`.

Isso **não** bloqueia o épico de dashboards: as execuções de 16/09 continuam com
resultados e artefatos não expirados, e foi delas que saíram as fixtures reais
(veja abaixo).

### Fixtures reais de resultados

`scripts/capture-results-fixtures.ts` grava em `src/core/results/__fixtures__/`
respostas reais de `results/summary`, `results/variables`, `results/timeseries`
e `artifacts`. Dois modos:

```bash
SIMULATION_ID=sim_… npx tsx scripts/capture-results-fixtures.ts   # execução já concluída
npx tsx scripts/capture-results-fixtures.ts                        # executa uma anual nova
```

Identificadores da conta são trocados por marcadores estáveis que ainda casam
com os padrões do contrato; números e nomes de campo ficam byte a byte.
`src/core/results/__tests__/fixtures.test.ts` trava o contrato observado. O que
essas fixtures ensinaram, e que a prosa do OpenAPI não dizia:

- **`hour` vai de 1 a 24 e é o fim do intervalo.** A hora 24 ainda pertence ao
  dia anterior, embora seu `timestamp` UTC já esteja no dia seguinte
  (`month: 1, day: 1, hour: 24` ⇄ `2013-01-02T03:00:00Z` com `utc_offset_hours: -3`).
  Tratar 24 como hora 0 do dia seguinte desloca a série em um dia.
- **O ano das séries é o do arquivo climático** (2013 nas fixtures), não o da execução.
- **Uma série anual horária cabe numa página:** 8 760 pontos com `proximo_cursor: null`.
- **`frequency` e `aggregation` usam grafias diferentes no mesmo objeto:** `hourly`
  (contrato, minúscula) e `Avg` (motor, capitalizada).
- **O catálogo é de tipos e é paginado.** `Zone Operative Temperature` foi gravada
  pela execução e mesmo assim não aparece na primeira página de 200. O catálogo
  não diz o que foi registrado — só o que o modelo poderia relatar (RDD/MDD).
- **Descobrir o que foi gravado é por tentativa.** Variável não registrada devolve
  **422** `"variável inexistente nesta simulação"`, com
  `errors[0].message = "a simulação não registrou 'X'"`. O mesmo 422 cobre a
  ambiguidade de chave, então quem consome precisa distinguir pelo corpo.
- **`Summary.comfort` vem em horas e tem três nomes:**
  `occupied_heating_setpoint_not_met`, `occupied_cooling_setpoint_not_met` e
  `simple_ashrae_55_not_comfortable`. Os dois primeiros deram 0 h nas duas
  execuções observadas; o terceiro deu 0 h numa e 332,5 h na outra.
- **`end_uses` traz os 14 recursos sempre, inclusive zerados, com unidades
  mistas** (GJ para energia, m3 para água). Gráfico que não filtrar desenha 14
  séries vazias por categoria; conversão cega para kWh mente na linha de água.
- **`Summary` real traz `simulation_id` e `status`**, que a interface local
  `Summary` em `src/features/simulation/api.ts` ainda não modela.
