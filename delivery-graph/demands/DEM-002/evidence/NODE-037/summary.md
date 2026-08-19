# NODE-037 — Linha do tempo na pasta da obra

**Demanda:** DEM-002 · **Track:** TRK-signature-ui · **Requisito:** REQ-023
**Depende de:** NODE-032, NODE-021 (`done`) · **Contrato: 4/4**

## O que entrou

`features/documentos/LinhaDoTempo.tsx`, ligado ao painel do documento, mais
`actor_nome` no contrato de `Etapa`.

**156 testes** no frontend (12 novos), tudo limpo.

## A tela não reordena nada

Quem sabe a ordem cronológica é o log imutável da API. O componente renderiza na
ordem recebida, e há teste comparando a sequência de ações renderizadas com a
sequência devolvida. Ordenar no cliente seria dar à tela uma opinião sobre um
registro de auditoria.

## Ação desconhecida aparece como veio

Se o servidor emitir uma ação que este cliente ainda não conhece, o rótulo cai no
próprio nome da ação em vez de a etapa sumir. **Uma etapa que o cliente não
reconhece ainda aconteceu** — omiti-la seria mentir sobre o histórico. Há teste.

## O "vazio" que não existe

Um documento recém-enviado tem **uma** etapa, não nenhuma. Por isso o caminho
normal nunca mostra estado vazio: a etapa de envio já é informação. O estado
`empty` só aparece no caso real de documento sem arquivo, e diz exatamente isso.

Há teste afirmando que, com uma etapa só, a linha do tempo a mostra e **não**
exibe "nenhum registro".

## Contrato — 4/4

| # | Item | Evidência |
|---|---|---|
| 1 | Ordem cronológica, com autor e horário | EVD-001 |
| 2 | Assinatura nomeia o signatário e a hora | EVD-002 |
| 3 | Documento recém-enviado mostra a linha mínima | EVD-003 |
| 4 | Carga, revalidação e erro distintos | EVD-004 |

## Um vazamento entre testes que a suíte cobrou

O teste de erro falhava porque `vi.clearAllMocks()` **não esvazia as filas de
`...Once`**: uma promessa pendente do teste de revalidação sobrava e travava o
seguinte. Troquei por `vi.resetAllMocks()` com o motivo escrito no próprio
`beforeEach`.

Vale registrar como armadilha geral: `clearAllMocks` limpa chamadas, não
implementações nem filas.

## Limitações conhecidas

- **Sem filtro por tipo de etapa.** Downloads aparecem junto com as decisões, e um
  documento muito baixado enche a lista. É a limitação que o NODE-032 já havia
  registrado do lado do servidor, agora visível na tela.
- **Sem paginação** — a API devolve tudo e a tela mostra tudo.
- **O horário usa o fuso do navegador** (`toLocaleString("pt-BR")`). Para uma
  trilha de auditoria pode ser preferível mostrar o fuso explicitamente; o
  `datetime` do elemento `<time>` guarda o ISO original.
- **Não há link da etapa para o objeto** — a etapa de assinatura não leva à
  assinatura, por exemplo.
