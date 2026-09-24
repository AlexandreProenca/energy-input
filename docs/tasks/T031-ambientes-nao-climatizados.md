# T031: Escolher quais ambientes são climatizados

- **Status:** Concluída
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T031-ambientes-nao-climatizados`
- **Refs:** [`docs/backlog.md`](../backlog.md); pedido do dono do produto — "precisamos diferenciar
  qual ambiente vai ser climatizado, porque o ambiente não climatizado vai acompanhar a
  temperatura externa"

---

## 1. Objetivo

O assistente punha um sistema ideal e um termostato em **toda** zona. Uma garagem, um depósito
ou uma varanda fechada eram mantidos em 18–26 °C como a sala, e o consumo de climatização e a
temperatura desses ambientes não correspondiam ao edifício real.

O pedido: escolher, ambiente por ambiente, quais são climatizados. O não climatizado fica livre
e a temperatura dele segue o clima.

---

## 2. Escopo

### O que entra

- Na página "Uso e climatização", a lista **Ambientes climatizados**: os ambientes da planta, ou
  os pavimentos no modo caixa, cada um com uma caixa de seleção. Todos começam marcados.
- `generateHvac` gera sistema, lista, conexões e controle só nas zonas climatizadas.
- A Revisão diz quantos são climatizados e quais ficam de fora.
- Dois cenários novos no `eplus-check`: `planta-garagem-livre` e `sem-climatizacao`.

### O que NÃO entra (deliberadamente postergado)

- **Cargas internas por ambiente.** Pessoas, iluminação e equipamentos continuam indo para todas
  as zonas pela `ZoneList`: uma garagem recebe a mesma densidade da sala. Separar isso é escolher
  um uso por ambiente, e é outra decisão de produto.
- **Escolha por ambiente e por pavimento.** Na planta, a escolha vale para o ambiente em todos os
  pavimentos, porque a planta se repete. Um térreo de garagem com pavimentos de apartamentos
  exigiria plantas diferentes por andar, que o assistente não tem.
- **Ventilação natural** do ambiente livre. Sem `ZoneVentilation`, ele troca ar só pela
  infiltração do uso.

---

## 3. Decisões tomadas

- **A resposta guarda os desmarcados, não os marcados.** Ausente quer dizer "todos
  climatizados", que é o comportamento de antes: autosave antigo não muda de sentido, e ambiente
  desenhado depois nasce climatizado sem ninguém lembrar de marcá-lo.

- **A chave é o id do ambiente, não o nome da zona.** O nome da zona muda quando o ambiente é
  renomeado ou quando muda o número de pavimentos; o id da planta não. No modo caixa, a chave é o
  índice do pavimento. Chave de ambiente apagado é ignorada na geração, e a lista a limpa na
  próxima mudança; a de pavimento fica, porque o índice volta (§5.1).

- **A escolha fica na climatização, não na geometria.** Climatizar é decisão sobre o sistema, e a
  página "Uso e climatização" é onde o usuário decide as temperaturas. A geometria continua só
  forma.

- **Não climatizado quer dizer sem sistema e sem termostato**, e não um termostato mais largo. É
  o que o pedido descreve: a temperatura acompanha o clima. Conferido no EnergyPlus local, com
  sala e garagem lado a lado em Florianópolis, ano inteiro:

  | | ar mín | ar máx | fora de 18–26 °C |
  |---|---|---|---|
  | Sala (climatizada) | 18,0 °C | 26,0 °C | 0 h |
  | Garagem (livre) | 12,7 °C | 30,9 °C | 2 182 h |

  A garagem segue a externa (correlação 0,85 na temperatura operativa horária), com as trocas com
  a sala amortecendo os extremos: a externa foi de 5,3 a 31,8 °C.

- **O termostato fica mesmo sem nenhuma zona climatizada.** O modo Resultados lê dele a faixa de
  conforto para contar horas de desconforto (`core/results/setpoints.ts`); tirá-lo deixaria o
  edifício em evolução livre, justamente o caso em que essas horas mais interessam, sem critério.
  Os tipos por zona, vazios, saem do documento.

- **"Faixa sem climatização", na barra de temperaturas, virou "faixa sem aquecer nem
  resfriar".** O rótulo antigo passaria a confundir com ambiente sem climatização.

---

## 4. Alterações realizadas

- `src/generators/conditioning.ts` e `conditioningKeys.ts`: novos — ambientes climatizáveis,
  chaves, `climatizado`, `alternarClimatizacao`, `resumoDaClimatizacao`.
- `src/generators/answers.ts`: `hvac.unconditioned`.
- `src/generators/geometry/boxGeometry.ts` e `floorPlan.ts`: `ZoneInfo.conditioningKey`.
- `src/generators/hvac.ts`: só zonas climatizadas; sem tipos vazios.
- `src/features/wizard/steps/HvacStep.tsx`: a lista, o aviso de nenhum climatizado e o rótulo da
  barra.
- `src/features/wizard/steps/ReviewStep.tsx`: o resumo.
- `scripts/eplus-check.ts`: dois cenários.
- `docs/PRD.md` (página 5) e `docs/DEVELOPMENT.md` (Ambientes não climatizados).
- Testes: `src/generators/__tests__/conditioning.test.ts` (novo, 14).

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 412 testes (eram 398; +14 nesta tarefa, 4 da revisão do PR)
- [x] `npm run build`
- [x] **Prova negativa:** sem o filtro em `generateHvac`, 4 dos 10 testes reprovam.
- [x] **Sincronização:** desmarcar remove os objetos do sistema do documento sem conflito e sem
      referência órfã; remarcar os devolve.
- [x] **EnergyPlus 26.1 local:** `planta-garagem-livre` (anual), `sem-climatizacao`, `padrao` e
      `planta-ambientes` sem `Severe` nem `Fatal`. Os números da tabela acima vêm do primeiro.
- [x] **No navegador:** a lista mostra os três pavimentos do projeto em modo caixa; desmarcar o
      primeiro tira os quatro objetos do sistema (99 → 95), o arquivo continua válido, e a
      Revisão diz "2 de 3 pavimentos climatizados; sem climatização: Pavimento 1". Remarcar volta
      a 99.

---

## 5.1 Revisão do PR

Cinco achados. **Um aceito**, quatro declinados:

| Achado | Veredito |
|---|---|
| Mexer na planta descartava os pavimentos desmarcados no modo caixa, e voltar a ele esquecia a escolha | **aceito** — a limpeza de sobras passou a valer só para chaves do mesmo tipo. A lógica saiu do componente para `alternarClimatizacao`, com teste |
| Concordância da frase da Revisão | **declinado** — os casos citados no próprio achado dão a frase certa; os quatro estão no teste |
| Tirar os tipos vazios deixaria referência órfã | **declinado** — só ficam vazios sem nenhuma zona climatizada, e aí nada aponta para eles; o teste desse caso confere as referências cruzadas |
| Zona com chave de ambiente apagado, "por cache" | **declinado** — a geração não tem cache: a zona só existe se o ambiente existe |
| Ambiente de área zero na lista | **declinado** — a validação da planta já recusa área abaixo de 0,01 m², antes da T031 |

Numa segunda rodada, **um achado procedente em parte**: a chave de pavimento é um índice, e o
índice volta. Ir de três para dois pavimentos e mexer na lista esquecia o terceiro; voltar a três
o trazia climatizado — mas só se o usuário tivesse mexido na lista no meio, o que tornava o
resultado dependente da ordem dos cliques. A regra passou a seguir a natureza de cada chave: a de
ambiente fica enquanto o ambiente existir na planta (o id de ambiente desenhado é UUID e não volta), a de pavimento
fica sempre, e o resto — autosave corrompido, apontado no mesmo parecer — sai. Declinados, por
repetirem a primeira rodada: tipos vazios e referência órfã, e a concordância da frase da Revisão.

A terceira rodada não trouxe achado procedente: o principal supunha que o modo caixa apaga os
ambientes da planta — não apaga, só muda `mode`, e o teste cobre esse caso. A Revisão descrever
só a geometria atual é de propósito; os demais repetiam rodadas anteriores.

---

## 6. Observações / armadilhas para tarefas futuras

**Temperatura operativa não é a controlada.** Mesmo climatizada, a sala sai de 18–26 °C pela
temperatura operativa em algumas centenas de horas, porque ela inclui a radiação das
superfícies; o sistema ideal controla o **ar**. Quem comparar o painel de temperatura com os
setpoints precisa saber disso.

**Ambiente livre ainda recebe as cargas do uso.** Uma garagem sem climatização continua com
pessoas, iluminação e equipamentos da sala, e fica mais quente do que ficaria de verdade. Enquanto
não houver uso por ambiente, o resultado dela é um limite superior.

**O ambiente inicial da planta tem id fixo, `initial-room`.** Os desenhados recebem UUID. Se o
usuário desmarcar o ambiente inicial, apagá-lo sem mexer na lista e depois a planta for recriada
do zero, o novo ambiente inicial herda o "sem climatização". É raro e aparece na lista, mas é o
único id que volta.
