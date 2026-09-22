# T006: Casca do modo Resultados

- **Status:** Concluída
- **Data:** 2026-09-22
- **Autor / Agente:** Claude Opus 5 (Claude Code)
- **Branch:** `task/T006-modo-resultados`
- **Refs:** [`docs/backlog.md`](../backlog.md) épico E1; T003 (cliente), T005 (conforto)

---

## 1. Objetivo

Abrir o quarto modo do aplicativo e resolver, antes dos gráficos, **o que a tela mostra
quando não há gráfico para mostrar**. Os estados de exceção vêm primeiro de propósito: se
ficassem para depois, cada um dos três painéis inventaria o seu.

---

## 2. Escopo

### O que entra

- `AppMode` ganha `'results'`; entrada no seletor de modos; carregamento com `lazy()`.
- `src/features/results/ResultsShell.tsx` com os quatro estados: sem execução, execução em
  andamento, execução que terminou sem sucesso, e execução concluída.
- Adoção de uma execução pelo identificador, disponível nos três estados em que faz sentido.
- Guarda contra modo desconhecido vindo do autosave, com teste.

### O que NÃO entra (deliberadamente postergado)

- Os painéis de consumo, temperatura e desconforto — **T008**, **T010** e **T011**.
- Componentes de gráfico — **T007**.
- Estado de série expirada (410): só aparece quando houver consulta de série, na T010.

---

## 3. Decisões tomadas

- **O seletor de modo virou uma busca, não um encadeamento de ternários.** O código anterior
  era `mode === 'geometry' ? <GeometryEditor/> : <ExpertShell/>`, dentro de um `mode ===
  'basic' ? … : …`. Qualquer modo novo cairia **silenciosamente** no `ExpertShell` — o
  `results` teria aberto o editor de objetos. Ver §6.

- **O aviso de dias de projeto é repetido aqui, embora o diálogo de simulação já o mostre.**
  Quem chega pelo modo Resultados não passou pelo diálogo. Duplicar um aviso é barato;
  deixar o usuário ler um consumo anual de uma execução que simulou duas datas, não.

- **A consulta por identificador aparece também ao lado de um resultado aberto.** Na primeira
  versão ela só existia no estado vazio, e quem adotasse uma execução ficava preso a ela sem
  recarregar a página — descoberto na verificação em navegador.

- **Modo desconhecido no autosave cai no assistente.** O autosave vive em `localStorage` e
  sobrevive a versões do aplicativo. Um `mode` de uma versão futura, ou storage corrompido,
  abriria o app numa tela que nenhum componente reconhece: página em branco sem explicação.

- **Não abrir ADR.** O backlog já decidiu que Resultados é um quarto modo (AGENTS.md §4).

---

## 4. Alterações realizadas

- `src/store/uiStore.ts`: `AppMode` ganha `'results'`.
- `src/App.tsx`: import com `lazy()`, entrada no seletor, e o ternário vira a tabela `MODOS`.
- `src/features/results/ResultsShell.tsx`: novo.
- `src/store/persistence.ts`: `modoValido` na restauração.
- `src/store/__tests__/persistence.test.ts`: novo, 4 testes.

---

## 5. Verificação e testes

- [x] `npm run typecheck`
- [x] `npm test` — 186 testes (eram 182; +4 nesta tarefa)
- [x] `npm run build` — **`ResultsShell` sai em chunk próprio** (`ResultsShell-*.js`,
      5,43 kB / 2,21 kB gzip), confirmando que o `lazy()` funciona e o painel não entra no
      bundle principal.
- [x] **No navegador, contra o serviço real**, os quatro estados:
      - sem execução → estado vazio com "Simular modelo" e consulta por identificador;
      - execução anual concluída (`sim_01M2NEQ…`) → cabeçalho com id e motor, resumo lido
        (14 usos finais, 3 indicadores de conforto), **sem** aviso de dias de projeto;
      - execução em dias de projeto (`sim_01M2KXZ…`) → **aviso de dias de projeto**;
      - troca de execução pelo campo, ida e volta entre as duas, com o aviso aparecendo e
        sumindo conforme o `run_type`.
- [x] Identificador inválido mantém o botão desabilitado (observado ao digitar lixo).

---

## 6. Observações / armadilhas para tarefas futuras

**O ternário de modos era uma armadilha esperando o próximo modo.** `mode === 'geometry' ?
<GeometryEditor/> : <ExpertShell/>` significa "qualquer coisa que não seja geometry é
especialista". Acrescentar `results` sem mexer nisso abriria o editor de objetos com o botão
"Resultados" aceso — um bug que nenhum teste de unidade pegaria e que passaria por descuido
de leitura. A tabela `MODOS` torna a omissão visível: modo sem entrada não renderiza nada
específico.

**`e.currentTarget.value` no `onKeyDown`, não a variável de estado.** A primeira versão
chamava `abrir()` lendo `id` do fecho do render. Com digitação rápida ou colagem, os
`onChange` ficam enfileirados e o `Enter` lê um `id` desatualizado: **a tecla não faz nada, e
não há erro nenhum**. Foi observado na verificação em navegador e vale para qualquer campo
com ação por `Enter`.

**A automação de navegador não é confiável para teclas em campo de texto.** `cmd+a` não
selecionou dentro do `input`, `triple_click` concatenou em vez de substituir, e o `Return`
enviado logo após `type` não chegou ao campo. O caminho que funcionou foi `form_input` para o
valor e um `KeyboardEvent` despachado por JavaScript para a tecla. Confirmar comportamento de
teclado por um desses dois meios, não pela sequência ingênua — senão o veredito é sobre a
automação, não sobre o aplicativo.

**A T010 precisa acrescentar o quinto estado: série expirada (410).** `isSeriesExpired` já
existe no cliente (T003). O painel deve cair para o resumo permanente com aviso, não mostrar
erro — a simulação existe, o que sumiu foi o `.sql`.
