# NODE-038 — Painel "aguardando minha assinatura"

**Demanda:** DEM-002 · **Track:** TRK-signature-ui · **Requisito:** REQ-032 (`could`)
**Depende de:** NODE-036 (`done`) · **Contrato: 3/3**

## O que entrou

| Arquivo | Papel |
|---|---|
| `app/api/signatures.py` | **`GET /me/signature-requests`** — a fila de quem chama |
| `features/assinatura/MinhasPendencias.tsx` | O painel, no alto da lista da obra |

**163 testes** no frontend (7 novos) e 4 novos no backend.

## A fila é do chamador por construção

O endpoint entrou no router `/me`, que **não recebe id de usuário em nenhuma
rota**. Ler a fila de outra pessoa não é proibido por uma checagem que alguém
possa afrouxar depois: é inexprimível, porque não há caminho que descreva isso.

Há teste inspecionando o schema OpenAPI e afirmando que a única rota de
`signature-requests` sob `/me` é a fila, sem `{user_id}` em lugar nenhum. Do lado
da tela, outro teste afirma que a chamada **não passa argumento algum** — a tela
não filtra nada, porque filtrar no cliente seria compensar uma responsabilidade
do servidor.

## Detalhes

**Pendência encerrada some da fila** — há teste que recusa uma solicitação e
verifica que ela sai. E **documento excluído também some**: não há o que assinar,
e mostrar o item levaria a uma tela quebrada.

**Estado vazio próprio**, porque nada a assinar é a situação normal da maioria dos
dias — não uma falha. Teste afirma que nesse caso não aparece nenhum alerta.

**O painel fica acima da lista de documentos da obra**: o que espera a pessoa vale
mais que o acervo, e ele se resume a uma linha quando não há nada.

## Contrato — 3/3

| # | Item | Evidência |
|---|---|---|
| 1 | Só pendências do próprio usuário | EVD-001 + EVD-002 (backend) |
| 2 | Cada item leva à tela de assinatura | EVD-003 |
| 3 | Estado vazio próprio | EVD-004 |

## Uma consequência que a suíte cobrou

Ligar o painel ao shell quebrou **5 testes** do `ObraShell`, que não simulavam
`minhasPendencias`. Não era bug: o shell ganhou uma dependência nova. Mock
adicionado ao fixture, com o motivo anotado.

## Uma correção de processo

Registrei a evidência do item 3 com o texto abreviado e o CLI recusou —
`"Sem pendencias o painel mostra estado vazio proprio"` não é o item do contrato,
que termina em `"e nao um erro"`. O gate está certo em exigir correspondência
exata: evidência amarrada ao item errado é evidência que não prova o item.

## Limitações conhecidas

- **Sem contagem nem indicador global.** Quem não abrir uma obra não vê o painel;
  um contador no cabeçalho seria melhor, e não é pedido.
- **Sem ordenação ou agrupamento por obra.** A fila vem na ordem de criação.
- **Sem atualização automática.** Uma solicitação criada enquanto a tela está
  aberta só aparece ao recarregar.
- O requisito é `could`; estas limitações são compatíveis com essa prioridade.
