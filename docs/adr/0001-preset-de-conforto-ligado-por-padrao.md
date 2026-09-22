# ADR-0001: Preset de conforto ligado por padrão

- **Status:** Aceita
- **Data:** 2026-09-22
- **Contexto da decisão:** T009, épico E1 ([`../backlog.md`](../backlog.md))

---

## Contexto

O PRD §9 pede que o aplicativo mostre **temperaturas operativas e horas de desconforto**.
As duas dependem da série horária de `Zone Operative Temperature`, que só existe se o modelo
tiver pedido a variável — e o preset `conforto`, que a pede, vinha **desligado**.

Isso cria uma armadilha silenciosa: o usuário roda a simulação, abre o modo Resultados e
encontra o painel vazio. Nada falhou; a saída simplesmente não foi solicitada, e não há como
descobrir isso depois da execução — a série teria de ter sido pedida **antes**.

Havia também um problema de fundo. O campo `defaultOn` em
`src/templates/outputs/outputs.json` era **dado morto**: um `grep` por `defaultOn` em `src/`
e `scripts/` só encontrava o próprio JSON e a declaração do tipo. O conjunto padrão real era
uma lista literal em `src/generators/answers.ts`:

```ts
outputs: { selected: ['resumo', 'cargas', 'conta'] },
```

As duas fontes coincidiam **por acaso**. Quem tentasse ligar o preset editando só o JSON —
o lugar óbvio — não mudaria nada, e o engano não deixaria rastro.

## Alternativas consideradas

### 1. Deixar o preset desligado e a interface detectar a ausência

O painel consultaria a série, receberia **422** e ofereceria "ligar o conforto e simular de
novo". Nada muda no arquivo gerado, e quem nunca abre o painel não paga nada.

Contra: só se descobre **depois** de esperar a simulação inteira. Numa execução anual, isso
significa rodar duas vezes para ver um número que o produto anuncia como entrega principal.
E o custo que essa alternativa evita é pequeno — veja abaixo.

### 2. Ligar o preset por padrão *(escolhida)*

O modelo passa a pedir quatro `Output:Variable` horários:
`Zone Mean Air Temperature`, `Zone Operative Temperature`, `Zone Air Relative Humidity` e
`Site Outdoor Air Drybulb Temperature`.

### 3. Pedir só `Zone Operative Temperature`

Seria o mínimo para o painel de temperatura. Mas a faixa adaptativa da T005 precisa da
temperatura **externa**, e separar as variáveis do preset deixaria o catálogo incoerente com
o que a etapa Resultados descreve ao usuário.

## Decisão

**Ligar o preset `conforto` por padrão**, e **derivar o conjunto padrão de `defaultOn`** em
vez de repetir a lista:

```ts
outputs: { selected: templates.outputs.filter((p) => p.defaultOn).map((p) => p.id) },
```

A segunda metade não é conveniência: é o que torna a primeira verdadeira e mantém `defaultOn`
como fonte única. Sem ela, a próxima pessoa que mexer no padrão repetirá o engano.

## Consequências

**Todo arquivo epJSON gerado passa a ter quatro `Output:Variable` a mais.** O custo é no
`eplusout.sql`: cerca de 4 variáveis × 8 760 horas × número de zonas. Num modelo de quatro
zonas são ~140 mil linhas — desprezível perto do que a execução já grava, e o `Output:SQLite`
do preset `resumo` já estava ligado.

**Os hashes de propriedade do `planWizardSync` mudam.** O assistente passa a escrever objetos
que antes não escrevia. Isso não dispara conflito, porque são objetos **novos** e o
`planWizardSync` só acusa divergência em objeto que ele já possuía e o usuário alterou. Os
testes de `wizardSync` continuam passando.

**Projetos salvos antes desta mudança não são afetados.** O autosave guarda
`outputs.selected` explicitamente, então uma sessão restaurada mantém o que tinha. O padrão
novo vale para projeto novo — e é a resposta certa: mudar a escolha de alguém em disco seria
pior que a armadilha que estamos consertando.

**O usuário continua podendo desligar.** A etapa Resultados do assistente segue com o preset
como caixa marcável; a decisão é sobre o **padrão**, não sobre obrigatoriedade.

## Verificação

`src/generators/__tests__/outputsPadrao.test.ts` trava as duas metades: que o padrão **deriva**
de `defaultOn` e que o documento gerado pede `Zone Operative Temperature` e
`Site Outdoor Air Drybulb Temperature`. Conferido por prova negativa — devolvendo
`defaultOn: false` ao JSON, dois testes reprovam.
