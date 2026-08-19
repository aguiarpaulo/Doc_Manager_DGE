# NODE-032 — Linha do tempo do documento

**Demanda:** DEM-002 · **Track:** TRK-signature-api · **Requisito:** REQ-023
**Depende de:** NODE-030, NODE-031 (`done`) · **Contrato: 5/5**
**Fecha a `TRK-signature-api`.**

## Uma etapa não existia

`POST /documents/{id}/review` movia o documento para *em análise* **sem registrar
nada**. Era uma das nove etapas que o contrato enumera, e a linha do tempo
simplesmente não conseguia mostrá-la — não por bug de exibição, mas porque o
registro nunca foi criado.

Descobri isso lendo os pontos onde `audit.record` é chamado antes de escrever a
tela. Agora `AuditAction.REVIEW` existe e o endpoint audita, com teste dedicado.

## Primeiro envio e nova versão viraram ações distintas

Antes, ambos gravavam `UPLOAD` com a versão no detalhe. Para quem lê a linha do
tempo são **eventos diferentes**: "documento enviado" e "documento substituído"
não significam a mesma coisa. Agora a segunda em diante grava
`AuditAction.NEW_VERSION`.

## O nome de quem agiu é resolvido no servidor

`AuditLogRead` ganhou `actor_nome`. Quem lê a linha do tempo não tem como
traduzir um UUID em pessoa, e obrigar a SPA a cruzar com `/users` exigiria papel
de administrador para ver quem assinou. Os nomes são resolvidos em **uma consulta
só**, não uma por linha.

**207 testes** (12 novos), `ruff` limpo.

## Contrato — 5/5

| # | Item | Evidência |
|---|---|---|
| 1 | Nove ações, um registro cada, com autor e hora | EVD-001 |
| 2 | Ordem cronológica | EVD-002 |
| 3 | Assinatura traz nome do signatário e hora | EVD-003 |
| 4 | Nenhum endpoint edita ou apaga | EVD-004 |
| 5 | Escopo de obra aplicado | EVD-005 |

## O teste que vale por vários

`_jornada_completa` percorre as nove etapas de verdade — upload, solicitação,
assinatura, recusa, nova versão (que cancela pendência), envio para análise,
aprovação e download — e depois afirma que **nenhuma falta** na linha do tempo. Se
alguém acrescentar um fluxo sem auditar, esse teste acusa.

Há também a contagem: cada ação aparece **exatamente uma vez**, o que pega
duplicação por commit repetido.

## Imutabilidade verificada estruturalmente

O teste varre as rotas da aplicação e afirma que qualquer caminho com `history`
ou `audit` só aceita `GET`/`HEAD`, e que não existe rota `/audit*`. Além disso,
`POST`/`PUT`/`PATCH`/`DELETE` em `/history` devolvem 405. A trilha é *append-only*
porque não há verbo que expresse outra coisa.

## Limitações conhecidas

- **A linha do tempo mistura eventos de documento com download.** Um documento
  muito baixado enche a lista. Filtrar por tipo de etapa seria útil; nenhum item
  de contrato pede.
- **Sem paginação.** Um documento com centenas de eventos devolve todos.
- **O nome vem do `username` atual do usuário**, então renomear alguém muda como
  ele aparece nas etapas antigas. A exceção é a assinatura, que guarda
  `signatario_nome` no próprio registro (NODE-029) e por isso não muda.
- **Sem tela** — é NODE-037.
