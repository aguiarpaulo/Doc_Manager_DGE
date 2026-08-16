# NODE-023 — Administração na SPA

**Demanda:** DEM-002 · **Track:** TRK-spa-foundation · **Requisito:** REQ-026
**Depende de:** NODE-021 (`done`) · **Contrato: 5/5**

## O que foi feito

`features/admin/AdminPage.tsx` na rota `/administracao`, com link no cabeçalho
que só aparece para administrador. Quatro blocos: usuários (criar, trocar papel,
ativar/desativar), obras (criar, arquivar), **acesso às obras** (conceder e
remover) e obras arquivadas (restaurar).

`data/admin.integration.test.ts` exercita as regras contra a API real.

**92 testes** + 24 de integração ao vivo · `tsc` e `eslint` limpos.

## Contrato — 5/5

| # | Item | Evidência |
|---|---|---|
| 1 | Área só para administrador, via `/auth/me` | EVD-006 |
| 2 | Acessível com zero obras cadastradas | EVD-002 |
| 3 | Restaurar obra arquivada única | EVD-003 |
| 4 | 403 no auto-rebaixamento, com motivo exibido | EVD-004 (ao vivo) |
| 5 | Rótulo do botão acompanha o estado sem novo envio | EVD-005 |

## Por que o item 4 foi ao servidor

A regra "administrador não reduz os próprios privilégios" **só existe em
`app/api/users.py`**. Testá-la com a fronteira simulada provaria apenas que sei
escrever um mock. Contra a API real ficou provado que:

- desativar a si mesmo → **403**;
- retirar o próprio papel → **403**;
- depois das duas tentativas o autor **continua administrador ativo**;
- agir sobre **outro** administrador é permitido — desativei e rebaixei um
  segundo admin sem obstáculo.

Esse último caso confirma o corolário que o CLAUDE.md documenta: só a auto-ação
pode deixar o sistema sem administrador, e por isso uma checagem de "último
administrador" seria código inalcançável.

A mensagem que a UI exibe é a que o servidor devolve, não texto inventado no
cliente — o teste afirma isso comparando o conteúdo.

## Uma lacuna de paridade que eu mesmo abri e fechei

A primeira versão deste nó satisfazia os 5 itens do contrato mas **não expunha a
atribuição usuário↔obra**, que existe no Streamlit. O contrato não a mencionava,
então teria passado — e o NODE-025 removeria uma funcionalidade em uso.

Fechei antes de concluir o nó: bloco "Acesso às obras" com conceder e remover,
mais dois testes. É o que define o escopo de engenheiro e financeiro
(`app/scope.py`); sem isso, esses papéis não enxergariam obra nenhuma.

**Lição para os nós seguintes:** contrato satisfeito não é o mesmo que requisito
satisfeito. O REQ-026 pede paridade, e paridade se confere contra o que existe,
não contra a lista de validação.

## Decisões de estrutura herdadas da UI anterior

**Nenhum bloco depende de existir obra.** Criar a primeira obra acontece nesta
tela, então um retorno antecipado por "nenhuma obra" travaria uma instalação
nova. O mesmo vale para restaurar: se a única obra do sistema foi arquivada,
esta tela precisa continuar alcançável — há teste com zero obras ativas e uma
arquivada.

**O botão de ativar/desativar fica fora de `<form>`.** Seu rótulo acompanha a
situação do usuário, e um formulário adiaria o rerender que atualiza o texto.

**Seletores de papel dentro da tabela têm rótulo oculto** (`Papel de paulo`):
dentro de tabela o cabeçalho da coluna não serve como nome acessível. Foi
adicionada a classe `.rotulo-oculto` em `index.css`.

## Limitações conhecidas

- **A tela não mostra quais obras cada usuário já acessa.** Concede e remove às
  cegas; a API não expõe endpoint de leitura dessa relação. Corrigir exige
  mudança no backend, fora do escopo deste nó.
- **`diretor` não administra nada.** Limitação do backend (`require_admin` em
  todos os endpoints), registrada no README; a UI apenas reflete.
- **Sem confirmação antes de arquivar obra.** Arquivar é reversível por desenho,
  mas um diálogo evitaria clique acidental.
- **A listagem de usuários não pagina nem filtra.**
- Roda contra SQLite; diferenças de dialeto ficam para o smoke de NODE-024.
