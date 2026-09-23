# T023: O sync do assistente não pode deixar referência órfã

- **Status:** Concluída
- **Data:** 2026-09-23
- **Autor / Agente:** Claude Opus 5.5 (Claude Code)
- **Branch:** `task/T023-referencia-preservada-no-sync`
- **Refs:** [`docs/backlog.md`](../backlog.md); T016 (o serviço voltou a executar e revelou
  este defeito)

---

## 1. Objetivo

A primeira simulação depois da T016 rodou até o motor, e o motor recusou o modelo:

```
** Severe ** FenestrationSurface:Detailed="PAVIMENTO 1 · <AMBIENTE A> - PAREDE 5 - JANELA 1",
             invalid construction_name="JANELA - VIDRO SIMPLES INCOLOR".
** Severe ** FenestrationSurface:Detailed="PAVIMENTO 1 · <AMBIENTE B> - PAREDE 2 - JANELA 1",
             invalid construction_name="JANELA - VIDRO SIMPLES INCOLOR".
**  Fatal ** GetSurfaceData: Errors discovered, program terminates.
```

Duas janelas apontavam para uma construção que não existia no documento. (Os nomes dos
ambientes estão substituídos: o modelo é projeto do usuário, e este repositório é público.) **Este era o
defeito do aplicativo que a falha do serviço escondia**: enquanto o motor não rodava, não
havia `.err` para mostrá-lo.

---

## 2. Escopo

### O que entra

- `planWizardSync` passa a **nunca** remover objeto do assistente que algo que fica ainda
  referencia, seguindo a cadeia (a construção mantém o material de vidro).
- `checkCrossReferences` passa a tratar como **erro** a referência inexistente nas listas
  em que o EnergyPlus nunca sintetiza nomes, o que faz o diálogo de simulação bloquear o
  envio.

### O que NÃO entra (deliberadamente postergado)

- **Consertar os documentos já quebrados.** A construção apagada não volta sozinha. Com esta
  tarefa, o diálogo mostra os dois erros e aponta as janelas, e o usuário escolhe o vidro
  no Editor 3D ou no Especialista.
- **Fazer as janelas do usuário acompanharem o vidro escolhido no assistente.** Janela criada
  no Editor 3D é do usuário, e o `planWizardSync` não mexe em objeto do usuário. Trocar o
  vidro delas em silêncio seria adivinhar intenção. Veja §6.
- Avisar na interface quando o sync retém um objeto. `SyncPlan.retained` fica disponível
  para isso.

---

## 3. Decisões tomadas

### A causa

A sequência, reproduzida em teste com o gerador e o editor reais:

1. o assistente gera o documento com o vidro `simples` e disponibiliza a construção
   `Janela - Vidro simples incolor`, que passa a ser **do assistente**;
2. o usuário põe janelas no Editor 3D usando essa construção. As janelas são **do usuário**;
3. o usuário troca o vidro para `pvc_4mm` na etapa Janelas;
4. o `planWizardSync` vê que a construção antiga deixou de ser gerada, que ela não foi
   editada, e a **remove** — sem olhar se as janelas do usuário ainda apontam para ela.

A regra "objeto criado pelo usuário nunca é removido" estava sendo cumprida. O que faltava
era a outra metade: objeto do usuário também não pode ficar apontando para o nada.

### O conserto no sync: reter o que ainda é referenciado

- **A remoção passou para depois da aplicação do que é gerado**, para que as referências dos
  objetos novos também contem.
- **Reter segue a cadeia até estabilizar.** A construção retida mantém o material de vidro
  que ela referencia, e esse material também tinha deixado de ser gerado. Sem seguir a
  cadeia, o motor pararia no material em vez de na construção.
- **Referência vinda de outro objeto que também está saindo não conta**, senão a construção
  e o material se manteriam vivos um ao outro para sempre.
- **O objeto retido continua sendo do assistente.** Quando nada mais apontar para ele, o sync
  seguinte o remove. Se deixasse de ser do assistente, viraria sobra permanente depois que
  o usuário apagasse as janelas.
- **A varredura não depende do schema:** todo valor de texto do objeto, em maiúsculas, porque
  o EnergyPlus compara nomes sem diferenciar maiúsculas. Uma coincidência (valor de enum igual
  ao nome de um objeto) só mantém no documento um objeto sem uso, que o motor aceita — e nos
  documentos gerados não há nenhuma (§5.1); uma referência perdida é `Fatal` no motor.

### O conserto na validação: erro, mas só onde a medição permite

O diálogo de simulação só bloqueia **erro**, e referência inexistente era sempre **aviso**.
A validação viu o problema e o deixou passar.

A primeira tentativa foi transformar em erro a referência inexistente em **campo
obrigatório**. **A medição derrubou essa regra.** Nos 752 exemplos oficiais do EnergyPlus
26.1 convertidos para epJSON, que rodam todos no motor, ela acusava **25 arquivos**. São nomes
que o próprio EnergyPlus sintetiza e o índice do schema não tem como conhecer: termostato
expandido por `ZoneList` (`"SPACE3-1 AllControlledZones Thermostat"`), espaço criado
automaticamente (`"Zone 5-Remainder"`), laços de planta. Um usuário do modo Especialista com
um desses modelos ficaria impedido de simular.

A regra adotada vem da medição por lista de referência nesses mesmos 752 arquivos:

| Lista | Referências | Sem alvo |
|---|---|---|
| `ConstructionNames` | 43 649 | **0** |
| `MaterialName` | 12 882 | **0** |
| `WindowFrameAndDividerNames` | 362 | **0** |
| `ScheduleNames` | 68 855 | 2 |
| `SurfaceNames` | 7 440 | 46 |

Viram erro só as três primeiras (`LISTAS_SEM_SINTESE`), que cobrem a cadeia do incidente:
janela → construção → material → esquadria. As outras seguem como aviso.

**Não abrir ADR.** É conserto de defeito sem mudança de comportamento anunciado no PRD.

---

## 4. Alterações realizadas

- `src/core/sync/wizardSync.ts`: remoção com retenção por referência; `SyncPlan.retained`.
- `src/core/validation/crossRefs.ts`: `LISTAS_SEM_SINTESE` e a severidade por lista.
- `src/core/sync/__tests__/referencias.test.ts`: novo, 8 testes. Inclui a sequência real do
  incidente.
- `src/core/validation/__tests__/crossRefs.test.ts`: novo, 5 testes.
- `docs/DEVELOPMENT.md` (Wizard ⇄ Expert) e `CLAUDE.md`: a regra nova.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 310 testes (eram 297; +13 nesta tarefa, 1 vindo da revisão do PR)
- [x] `npm run build`
- [x] **O defeito foi reproduzido antes do conserto.** Com a sequência real, o teste central
      reprovou com a construção apagada. A contraprova, de que o documento está íntegro
      **antes** do sync, passou.
- [x] **Prova negativa da validação:** devolvendo a severidade a `warning`, os dois testes de
      erro reprovam.
- [x] **Medição de falso positivo:** zero erros novos nos 752 exemplos oficiais. A regra
      anterior acusava 25.
- [x] **A regra acusa exatamente o modelo real que falhou**, lido do serviço só para
      diagnóstico e **não** incluído no repositório (é projeto do usuário, e o repositório é
      público): dois erros, nas mesmas duas janelas que o EnergyPlus recusou.
- [x] **EnergyPlus 26.1 local, três execuções:**

      | Execução | Resultado |
      |---|---|
      | O modelo real do usuário | `Fatal`: as mesmas 2 janelas do serviço |
      | A sequência do incidente, sync corrigido | **`Completed Successfully`, 0 Severe** |
      | A mesma sequência sem o que o sync reteve | `invalid construction_name`: o defeito |

      Na segunda execução o sync reteve a construção **e** o material de vidro
      `WindowMaterial:SimpleGlazingSystem`: a cadeia é necessária.

---

## 5.1 Revisão do PR

Cinco achados. **Um aceito, quatro declinados, cada um com o motivo.**

| Achado | Veredito |
|---|---|
| Faltava teste da cadeia de 3 níveis | **aceito** — a lógica já cobria (a própria revisão concluiu isso), e o teste trava |
| `some` deveria ser `every` em `LISTAS_SEM_SINTESE` | **declinado** — com `every`, o conserto **não pegaria o próprio incidente**: o `construction_name` da janela aponta para `ComplexFenestrationStates` e `ConstructionNames`, e só a segunda está no conjunto. A medição é por lista em toda referência que a inclui, e a remedição com `some` deu zero falsos positivos |
| O ponto fixo é O(N²) | **declinado** — o número de voltas é limitado pela profundidade da cadeia (janela → construção → material → esquadria), não pelo número de objetos |
| A varredura sem schema pode reter objeto por coincidência de texto | **declinado com medição** — veja abaixo |
| Assimetria entre referências de objetos que saem e objetos que ficam | **declinado** — a própria revisão concluiu que é intencional e correta |

**A coincidência de texto foi medida, não suposta.** Em 7 variantes do documento gerado (o
padrão, os cinco vidros com janelas automáticas e o recuo noturno), **nenhum** nome de objeto
coincide com o valor de um campo que não é referência. O caso restante é o usuário, no
Especialista, escrever em campo comum um texto igual ao nome de um objeto do assistente. O
efeito é um objeto sem uso que fica no documento, e o EnergyPlus o aceita. Usar o schema na
varredura acoplaria o sync ao índice do schema para evitar esse caso, e o erro oposto — perder
uma referência — é `Fatal`.

---

## 6. Observações / armadilhas para tarefas futuras

**Um defeito escondia o outro.** Enquanto o serviço não executava (T016), este defeito era
invisível: sem motor não há `.err`. Destravar o serviço foi o que o revelou, na primeira
simulação. Vale ao consertar infraestrutura: a próxima falha pode ser do produto, e ela
**deve** aparecer.

**Medir antes de endurecer uma validação.** "Campo obrigatório sem alvo é erro" parecia
obviamente certo, e bloquearia 3% dos modelos oficiais do EnergyPlus. O conversor
`ConvertInputFormat` do próprio EnergyPlus transforma os exemplos em epJSON em segundos; é o
corpus certo para medir qualquer regra que possa bloquear simulação.

**As janelas do usuário não acompanham o vidro do assistente, e isso é deliberado.** Depois
desta tarefa, trocar o vidro na etapa Janelas muda as janelas geradas pelo assistente e deixa
as desenhadas no Editor 3D com o vidro com que foram criadas. É consistente com "objeto do
usuário não é tocado", mas quem troca o vidro provavelmente espera que todas mudem. Se isso
virar pedido, é uma decisão de produto: perguntar, ou oferecer "aplicar também às janelas que
você desenhou". Não é um ajuste silencioso no sync.

**Sobre a T016:** a verificação pendente dela continua pendente, e a data prevista estava
errada. A limpeza de 23/09 **não** apagou a imagem do motor: ela tinha menos de 24 h no disco,
porque foi rebaixada durante o diagnóstico. A simulação deste incidente a encontrou presente.
A primeira limpeza que a pega é a de 24/09.
