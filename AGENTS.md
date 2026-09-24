# AGENTS.md — como trabalhar neste repositório

Protocolo de trabalho para qualquer agente de IA (ou pessoa) que contribua aqui.
Neutro de ferramenta: vale para Claude Code, Codex, Cursor, Copilot ou terminal.

Este arquivo responde **como trabalhar**. Ele não descreve o produto (isso é o
[`docs/PRD.md`](docs/PRD.md)) nem o estado de evolução/notas técnicas (isso é o
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) e [`MEMORY.md`](MEMORY.md)).

---

## 1. Antes de escrever qualquer linha

Nesta ordem:

1. **[`MEMORY.md`](MEMORY.md)** (se presente) — estado atual, decisões já tomadas e
   armadilhas descobertas.
2. **Este arquivo** — o ciclo de trabalho e as regras invioláveis.
3. **[`docs/PRD.md`](docs/PRD.md)** — o que o produto é, requisitos e escopo.
4. **[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)** — detalhes de arquitetura, geometria,
   superfícies compartilhadas, presets e integração de simulação.
5. **[`docs/backlog.md`](docs/backlog.md)** — a tarefa e suas dependências.

Não comece uma tarefa cuja dependência ainda esteja aberta sem entender por quê.

---

## 2. Mapa dos documentos

Cada assunto tem **um** dono. Escrever a mesma coisa em dois lugares garante que
um dos dois vai envelhecer mentindo.

| Arquivo | Responde | Muda quando |
| --- | --- | --- |
| `docs/PRD.md` | o que o produto é — fonte da verdade do escopo e requisitos | o produto muda de rumo |
| `AGENTS.md` (este) | como trabalhar: ciclo, convenções, regras | o processo muda |
| `docs/DEVELOPMENT.md` | detalhes técnicos, algoritmos de geometria e notas de dev | a implementação ou arquitetura evolui |
| `MEMORY.md` | em que pé está, o que já foi decidido, armadilhas encontradas | **a cada tarefa** |
| `docs/backlog.md` | as tarefas, dependências e estado | a cada tarefa concluída ou criada |
| `docs/tasks/TNNN-*.md` | uma tarefa: escopo, decisões, critérios, verificação | criado com a tarefa; depois é **histórico**, não se reescreve |
| `docs/adr/NNNN-*.md` | decisões de arquitetura, com os fundamentos que as sustentam | quando uma decisão dessas é tomada ou substituída |
| `CHANGELOG.md` | o que mudou, por tarefa/versão | a cada tarefa |

---

## 3. O ciclo de uma tarefa

**Uma tarefa = uma branch = um documento + código/testes + commit + PR.**

```bash
# 1. Branch a partir de main atualizada
git checkout main && git pull --ff-only
git checkout -b task/TNNN-slug

# 2. Implementa, com testes
npm run dev

# 3. Portões locais — nada avança vermelho
npm run typecheck && npm test && npm run build

# 4. Commit único, com doc + código + testes juntos
git commit

# 5. PR
git push -u origin task/TNNN-slug
gh pr create --base main
```

O commit precisa conter, além do código e dos testes:

- `docs/tasks/TNNN-slug.md`, a partir de [`docs/tasks/_template.md`](docs/tasks/_template.md);
- a linha da tarefa marcada como concluída em `docs/backlog.md`;
- uma entrada no `CHANGELOG.md`.

**O `MEMORY.md` vem depois, em PR próprio**, após o merge na `main` (ou na sincronização
do número do PR).

---

## 4. Quando escrever o quê

| Situação | Onde registrar |
| --- | --- |
| Qualquer tarefa do backlog | doc de tarefa em `docs/tasks/` — **sempre** |
| Decisão que contraria ou estende o PRD | **ADR** em `docs/adr/` + link no doc da tarefa |
| Alternativa arquitetural descartada por medição | **ADR**, com os dados/números |
| Escolha local, óbvia dado o contexto | seção "Decisões tomadas" do doc da tarefa |
| Armadilha que custou tempo | `MEMORY.md` (armadilhas) ou `docs/DEVELOPMENT.md` |
| Peculiaridade do schema epJSON ou do motor | teste que a documenta **e** `docs/DEVELOPMENT.md` |
| Pergunta que trava decisão | `MEMORY.md`, com o contorno adotado |
| Refatoração trivial, renome, typo | só a mensagem de commit |

ADR é caro de ler; use quando alguém fosse plausivelmente decidir diferente.
Não abra ADR para aplicar o que o PRD já determina.

---

## 5. Portões de qualidade

```bash
npm install           # instala dependências
npm run schema        # compila/valida public/schema a partir de schema/<versão>/
npm run typecheck     # checagem estrita de tipos TypeScript (tsc -b --noEmit)
npm test              # suíte de testes com Vitest (unitários e integração)
npm run build         # compila schema + typecheck + bundle Vite para dist/
npm run eplus-check   # opcional: validação contra o binário real do EnergyPlus (dev)
docker compose up     # teste do container estático de produção (Nginx)
```

Regras:

- **Nada avança vermelho.** Se um teste quebrou, o problema é o código ou o
  teste — não o portão.
- `TypeScript` roda em modo estrito (`strict: true`), sem `any` injustificado.
- **`src/core/` é 100% puro e isolado:** lógica de domínio, parsers,
  validação e geometria vivem em `src/core/` e não devem importar React,
  Zustand, Three.js ou o DOM. Devem ser testáveis diretamente no Vitest.
- Teste de geometria e de superfícies compartilhadas precisa de contraprovas
  (falsos positivos, orientações reversas, tolerância dimensional).

---

## 6. Convenções de commit e PR

[Conventional Commits](https://www.conventionalcommits.org/), com o id da tarefa
no rodapé:

```
feat(geometry): suporte a aberturas em paredes compartilhadas com pareamento inverso

Explica POR QUE, não o que o diff já mostra. Se houve uma armadilha, ela
entra aqui: é o texto que a próxima pessoa vai ler no `git log`.

Refs: T015
```

Tipos comuns:
- `feat`: nova funcionalidade para o usuário ou assistente.
- `fix`: correção de bug em gerador, validador, 3D ou UI.
- `refactor`: reestruturação de código sem alteração de comportamento.
- `test`: novos testes ou correções na suíte de testes.
- `docs`: documentação em `docs/`, `PRD.md` ou `README.md`.

O corpo do PR deve deixar claro: o que entra, **o que ficou de fora de
propósito** (com a tarefa que cobre), e o que foi verificado.

Documentação e mensagens em **pt-BR**.

---

## 7. Regras invioláveis

- **`schema/` é a fonte da verdade do EnergyPlus.** O arquivo
  `schema/<versão>/Energy+.schema.epJSON` é extraído do pacote oficial do
  EnergyPlus via `npm run fetch-schema`. **Não editar esse arquivo manualmente**.
  A geração de `public/schema/<versão>/schema.json` é feita pelo script
  `npm run schema`.
- **`src/core/` não depende de React nem de UI.** Regras de epJSON, geometria,
  sincronização de respostas, validação e climas são funções puras e determinísticas.
- **Nenhum segredo no bundle, versionado ou em armazenamento do navegador.** Cada pessoa entra
  com e-mail e senha; o **token de acesso vive só na memória da aba** e o refresh token só em
  cookie `HttpOnly` — nunca em `localStorage` nem `sessionStorage`, e a senha não sai do
  componente da tela de login. Os proxies não têm credencial própria: repassam o `Authorization`
  do navegador e, só nas rotas de sessão, o cookie; recusam rota fora da lista, método fora de
  GET/POST e pedido de outra origem ([ADR-0004](docs/adr/0004-login-de-usuario-e-token-na-memoria.md)).
  `SIMULATION_API_TOKEN` existe só para scripts em Node, nunca com prefixo `VITE_`, nunca no
  bundle nem no contexto de build do Docker.
- **Proteção contra perda de dados do usuário (`planWizardSync`).** Nunca sobrescrever
  silenciosamente objetos epJSON editados ou criados manualmente no Modo Especialista
  ou Editor 3D quando o Assistente for executado. Se houver divergência, acione o
  diálogo de resolução de conflitos. **Exceção única e anunciada:** as janelas desenhadas pelo
  usuário que seguem o vidro do assistente acompanham a troca de vidro, com aviso na tela
  ([ADR-0002](docs/adr/0002-janelas-acompanham-o-vidro-do-assistente.md)). Estender a exceção
  a outra escolha do assistente exige decisão própria.
- **Conformidade de Marca (Licença EnergyPlus).** O produto não pode se chamar
  "EnergyPlus API" nem usar a marca registrada do EnergyPlus como nome próprio.
  O nome oficial é **Energy Input** ("Arquivos epJSON para EnergyPlus").
- **Doc de tarefa concluída é histórico.** Não reescreva arquivos em `docs/tasks/`
  para refletir o presente: o presente vive no `docs/PRD.md`, `docs/DEVELOPMENT.md`
  e no backlog.

---

## 8. Revisão automática por IA

Quando houver revisão automática de PRs (por exemplo, via GitHub Actions):
- **Verifique antes de agir.** O revisor automático recebe um diff parcial e pode
  desconhecer regras específicas do epJSON ou de tolerâncias geométricas.
- **Não descarte em bloco.** Avalie pontuações de tipagem estrita, tratamento de
  exceção ou casos de borda em polígonos.
- Ao aceitar um apontamento, **corrija acompanhado de teste**.

---

## 9. Ambiente

- **Node.js >= 20.x** e **npm >= 10.x**.
- Dependências gerenciadas via `npm` (`package-lock.json` versionado).
- Compilação e desenvolvimento:
  ```bash
  npm install
  npm run dev          # servidor Vite em http://localhost:5173
  ```
- Produção e contêiner:
  ```bash
  docker compose up --build       # Nginx servindo build estático em http://localhost:8080
  ```
- Validação opcional com EnergyPlus local:
  ```bash
  EPLUS_DIR=/Applications/EnergyPlus-26-1-0 npm run eplus-check
  ```

---

## 10. Quando faltar informação

Não invente requisito. Se a resposta muda o que você faria:

- se é dúvida do produto, veja se já está no [`docs/PRD.md`](docs/PRD.md) ou em
  [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md);
- se não está, **pergunte** ao usuário antes de implementar;
- entregue tudo o que não depende da resposta, deixando explícito o que ficou
  pendente e por quê.
