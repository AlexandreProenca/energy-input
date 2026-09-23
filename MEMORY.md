# MEMORY.md — em que pé está o projeto

Estado atual, decisões já tomadas e armadilhas que custaram tempo.
Atualizado a cada tarefa, em PR próprio após o merge (`AGENTS.md` §3).

Este arquivo **não** descreve o produto (isso é [`docs/PRD.md`](docs/PRD.md)) nem a
arquitetura (isso é [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)). Ele responde: onde
paramos, no que já esbarramos, e o que não deve ser redescoberto do zero.

---

## Onde paramos

**Versão 0.1.0, 345 testes.** Quatro modos: Assistente (10 etapas), Editor 3D e
Especialista **escrevem** no documento; **Resultados** lê execuções concluídas e não
escreve.

**Épico E1 — Dashboards de Análise Energética e Estudos** ([`docs/backlog.md`](docs/backlog.md)):

| Fase | Tarefas | Estado |
| --- | --- | --- |
| 0 — Destravar | T001, T002 | concluída |
| 1 — Núcleo puro | T003–T005 | concluída |
| 2 — Modo Resultados | T006–T011 | **concluída**: os três painéis do PRD §9 |
| 3 — Estudos | T012–T015 | **próxima**. A T012 escreve o ADR do estudo paramétrico |

Fora das fases: **T016** (execução no serviço), **T017–T020** (CI e revisão por IA) e **T023**
(referência órfã no sync), **T024** (janelas acompanham o vidro) e **T025** (várias zonas) concluídas; **T021** e **T022** são do serviço, não deste
repositório, e ficam no backlog para não se perderem.

**A execução no serviço voltou a funcionar em 23/09** (T016), e a primeira simulação chegou ao
motor e revelou um defeito **deste** aplicativo, corrigido na T023.

Decisões de rumo, já fechadas com o usuário:

| Assunto | Escolha |
| --- | --- |
| Gráficos | SVG próprio, sem dependência nova; carpete em `<canvas>`; agregação em `src/core/` |
| Modo do estudo | `parametric` (não `iterative`) |
| Lugar na interface | Novo modo **Resultados**, quarto item do cabeçalho |
| Sequência | Dashboards primeiro; estudos depois |
| Preset `conforto` | ligado por padrão — [ADR-0001](docs/adr/0001-preset-de-conforto-ligado-por-padrao.md) |

---

## Armadilhas vigentes

### O contrato de séries tem três convenções que enganam

Confirmado com dado real e travado em `src/core/results/__tests__/fixtures.test.ts`:

- **`hour` vai de 1 a 24 e é o fim do intervalo.** A hora 24 ainda pertence ao dia
  anterior, embora seu `timestamp` UTC já esteja no dia seguinte. Tratar 24 como hora 0 do
  dia seguinte desloca a série inteira em um dia.
- **O ano é o do arquivo climático** (2013 nas fixtures), não o da execução.
- **`frequency` e `aggregation` usam grafias diferentes no mesmo objeto:** `hourly`
  (contrato) e `Avg` (motor).

### O catálogo de variáveis não diz o que foi gravado

`/results/variables` é RDD/MDD — o que o modelo *poderia* relatar — e vem paginado em 200.
Não existe rota que responda "o que esta execução registrou": a descoberta é por
tentativa. **A zona é descoberta pelo 422, não pelo catálogo.** Há três 422, capturados na T025
(`src/core/results/__fixtures__/erro-422-*`):

- sem chave, várias zonas: `candidata: key='…', frequency=hourly`;
- chave inexistente: `existe: key='…', frequency=hourly`;
- variável não registrada: `a simulação não registrou '…'` — **sem** candidata.

A candidata é o que está **entre as aspas**, e o pedido leva chave **e** frequência. As chaves
vêm em maiúsculas, como o EnergyPlus as grava no `.sql`.

### Teste contra contrato inventado trava o defeito

O seletor de zonas quebrou na primeira execução real com duas zonas (T025) porque o teste usava
um corpo de 422 **inventado** — a mensagem igual à chave — e outro teste travava a mensagem de
"variável não registrada" como candidata. Os dois defendiam exatamente o que estava errado.
**Quando um formato do serviço não pôde ser observado, o teste diz isso ou espera a fixture;
não preenche a lacuna com palpite.**

### `limpar()` do `resultsStore` nunca é chamado pelo app

Trocar de execução não passa por ele. Toda carga "de abertura" precisa zerar o próprio estado
— a T025 achou as zonas da execução anterior sobrevivendo no seletor da seguinte.

### Os indicadores de conforto do resumo não medem a mesma coisa

`src/generators/hvac.ts` escreve `NoLimit` em todo `ZoneHVAC:IdealLoadsAirSystem`, então
`occupied_heating_setpoint_not_met` e `occupied_cooling_setpoint_not_met` são
**estruturalmente zero** nos modelos deste app. Eles medem controle do sistema, não conforto.

Já `simple_ashrae_55_not_comfortable` **não é zero**: o modelo padrão do gerador, rodado
localmente em anual, dá **7 587 h** (T011). É o fallback de verdade quando a série expira.

**As fixtures não servem para julgar conforto.** Vieram de um modelo sem ocupante nem
climatização (`conditioned: 0 m²`, só `Exterior Lighting` com consumo), e por isso dão 0 h
nos três indicadores e um medidor de energia zerado o ano inteiro. Antes de concluir algo
sobre o serviço, confira se o modelo tinha o que medir.

### A faixa de conforto vem do documento, não do assistente

O modo Resultados abre execução de outra sessão pelo identificador, e o Modo Especialista
desliga o vínculo com o assistente. Classificar horas contra `answers.hvac` daria um número
plausível e indefensável. `bandFromDocument` lê o termostato do documento e exige que todos
os termostatos concordem (T011).

### O Vitest roda sem DOM

`environment: 'node'`, sem jsdom. Lógica dentro de `.tsx` não tem teste possível. Os
componentes de gráfico recebem dado já agregado; tudo que decide o que aparece na tela fica
em `src/core/` ou num `.ts` ao lado (`features/results/estado.ts`).

### Gráfico plausível em mais de uma configuração se verifica por número

O carpete da T010 parecia certo com o eixo de horas **invertido**, porque a madrugada é fria
nas duas pontas. Só a leitura de pixels do `<canvas>` provou a orientação. Na T011, a
contagem de pixels por cor bateu célula a célula com os indicadores. **Olho não basta.**

### `summary` não sobrevive ao HMR

O resumo da execução não é persistido, por decisão de projeto. Depois de um hot reload o
painel de consumo fica em branco e parece regressão. Readote a execução antes de concluir
qualquer coisa.

### Tabela de tradução sem teste de cobertura apodrece em silêncio

Três casos de dado morto até aqui: `defaultOn` que nada lia (T009), a lista literal em
`answers.ts` (T009) e o dicionário com `InteriorLighting` sem espaço, que nunca casou com
o `Interior Lighting` da API (T011). O fallback que devolve o nome original faz o defeito
parecer "ainda não traduzido". `rotulos.test.ts` percorre a fixture real — é o padrão a
seguir.

### O sync do assistente não pode deixar referência órfã

O `planWizardSync` apagava o objeto do assistente que deixava de ser gerado sem olhar quem
ainda apontava para ele. Janelas desenhadas no Editor 3D com o vidro do assistente ficavam
apontando para uma construção apagada quando o usuário trocava o vidro, e o EnergyPlus parava
com `invalid construction_name` (T023). Agora o sync **retém** o que ainda é referenciado,
seguindo a cadeia até o material. Qualquer mudança nessa remoção precisa passar em
`referencias.test.ts`, que reproduz a sequência real.

### As janelas desenhadas pelo usuário acompanham o vidro do assistente

Decisão do dono do produto (T024, [ADR-0002](docs/adr/0002-janelas-acompanham-o-vidro-do-assistente.md)):
trocar o vidro no assistente troca o de **todas** as janelas; ajuste pontual é no Modo
Especialista. É a **única** exceção à regra de que o assistente não altera objeto do usuário, e é
estreita: só janelas cuja construção é o vidro que o assistente oferecia, e **sempre com aviso**.
Uma janela com outro vidro é escolha específica e fica.

**Não generalize** para parede, laje ou material sem decisão própria — o ADR e o AGENTS.md §7
limitam a exceção ao vidro. E lembre que **o preset Apartamento troca o vidro sozinho**: escolha
do assistente com efeito colateral em outra resposta é o que surpreende quem desenhou à mão.

### Endurecer validação exige medir antes

A checagem de referências é "best-effort", porque o EnergyPlus sintetiza nomes que o índice do
schema não conhece (termostato expandido por `ZoneList`, espaço criado automaticamente). "Campo
obrigatório sem alvo é erro" parecia óbvio e bloquearia **25 dos 752** exemplos oficiais do
EnergyPlus, que rodam. Só viram erro as listas medidas sem nenhum falso positivo
(`LISTAS_SEM_SINTESE`: construção, material, esquadria). **O corpus de medição** são os exemplos
oficiais convertidos com o `ConvertInputFormat` do próprio EnergyPlus — 752 arquivos em cerca de
10 segundos. Ampliar a lista exige medir de novo.

### Falha em menos de um segundo, em qualquer modelo, é o serviço

`duracao_segundos: 0.0`, zero artefatos e nenhum `.err` em modelos diferentes quer dizer que
o motor nem rodou (T016). epJSON inválido chega ao motor e deixa `Severe`/`Fatal` no `.err`.
Não investigue o epJSON antes de descartar o serviço. **O inverso também vale:** com o serviço
funcionando, `Severe`/`Fatal` no `.err` é do modelo, e a primeira execução depois da T016
mostrou exatamente isso (T023).

### O allowlist do proxy é controle só de desenvolvimento

`scripts/simulationRoutes.ts` barra rotas não previstas no `npm run dev`. O
`docker/nginx.conf` de produção usa um `location` de **prefixo** e repassa qualquer
sub-rota. **Produção é mais permissiva que o desenvolvimento**, de propósito; a assimetria
precisa ficar escrita, e não ser "corrigida" apagando o allowlist. No CI, o teste de
contêiner chama o proxy e aceita **401** como sucesso: prova o handshake TLS (T017).

### `@/` não resolve dentro de `scripts/simulationProxy.ts`

O `vite.config.ts` importa esse plugin, e o esbuild carrega a config **antes** de o alias
existir. Use caminho relativo.

### O catálogo de climas do tenant tem dois arquivos, e a busca por nome é exata

`GET /v1/weather?city=São Paulo` devolve lista vazia porque o tenant só tem
**Florianópolis (SC)** e **Peixe (TO)**. `city=` vazio lista tudo. O tipo `Weather` em
`src/features/simulation/api.ts` segue defasado em relação à resposta real (`country`,
`declared_type`, graus-dia, licença e outros campos não modelados).

### A revisão por IA é check obrigatório, e erra dos dois lados

Vive em `scripts/aiReview/`, com teste (T020). Três tarefas seguidas remendaram o parser
quando ele ficava dentro do YAML (T018, T019). Resposta ambígua **reprova**, em vez de o
parser adivinhar. Na prática: aceite o achado que tem cenário de falha, decline o
especulativo **com o motivo escrito no doc da tarefa**, e leia o parecer **mais recente**
antes de mesclar. No PR #12 o merge veio antes da leitura e deixou passar uma regressão.

### No navegador embutido, digitação e Enter não são confiáveis

`cmd+a` não seleciona dentro do campo, `triple_click` concatena, e `Return` depois de
`type` pode não chegar. O caminho confiável é definir o valor com o setter nativo mais um
evento `input` e **clicar** no botão. Falha de automação não é defeito do aplicativo.

### Este repositório é público

Docs, commits, PRs e logs de CI são públicos. Não descreva a infraestrutura do serviço de
simulação (caminhos, contas, credenciais, isolamento). A primeira versão do doc da T016
fazia isso e foi reescrita antes do commit.

---

## Resolvidas — não redescobrir

| O que era | Onde foi resolvido |
| --- | --- |
| Proxy da imagem Docker devolvia 502 em toda chamada (`proxy_ssl_verify_depth` padrão 1) | T002 |
| nginx nunca comprimia resposta de proxy (faltava `gzip_proxied`) | T002 |
| `defaultOn` ignorado; o padrão real era uma lista literal | T009 |
| Seletor de modo caía silenciosamente no Especialista | T006 |
| Troca de execução no meio da carga travava o painel em "Lendo…" | T008 |
| Revisão por IA caía com JSON seguido de texto, depois passava em silêncio | T018–T020 |
| Nenhuma simulação concluía no serviço (19/09 a 23/09) | T016 |
| Trocar o vidro deixava janelas do Editor 3D sem construção (`invalid construction_name`) | T023 |
| O diálogo de simulação deixava passar referência inexistente (era só aviso) | T023 |
| Trocar o vidro no assistente deixava as janelas desenhadas com o vidro antigo | T024 |
| Seletor de zonas oferecia a mensagem do 422 como zona; abrir outra execução herdava as zonas | T025 |

---

## Perguntas em aberto

Com a execução destravada, as três primeiras podem ser respondidas com execuções novas de
modelos **gerados por este aplicativo**:

- **A primeira simulação depois de uma limpeza do servidor que de fato apague a imagem do
  motor funciona?** É o que falta para fechar a verificação da T016. A data prevista no doc da
  tarefa (23/09) estava errada: a imagem tinha sido rebaixada durante o diagnóstico e
  sobreviveu. A primeira limpeza que a pega é a de 24/09.
- **Retenção do `.sql`.** O contrato diz que `/results/timeseries` responde 410 depois de um
  prazo que não numera.
- **Horas de desconforto do edifício inteiro.** Hoje o painel mostra uma zona por vez e diz
  qual. Agregar exige escolher critério (área? ocupação?) — decisão de produto (T025).
- **Cota de estudo.** Existe `402` no contrato e um `/v1/usage`, que exige escopo
  `admin:billing`. Um estudo de 20 variações pode ser recusado. Afeta a T014.
- **Estabilidade de `TabelaDeResultados.columns[].key`** (ex.: `end_use::Heating::Electricity`)
  entre versões do motor. Afeta a união de colunas entre páginas na T015.
