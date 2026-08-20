# NODE-042 — E-mail de recusa ao solicitante (API)

**Demanda:** DEM-003 · **Track:** TRK-lacunas-api · **Requisito:** REQ-038
**Contrato: 6/6** · Fecha a `TRK-lacunas-api`

## O que entrou

`send_signature_declined` nas três implementações do protocolo `EmailSender`, e o
disparo no endpoint de recusa. **243 testes** no backend (6 novos), `ruff` limpo.

## A ordem importa e é a mesma dos nós anteriores

O envio acontece **depois do commit** da recusa, e a falha de SMTP é engolida.
Perder o aviso é recuperável — a pendência já está encerrada e visível no
aplicativo; perder a recusa não seria. Há teste apontando o sender para uma porta
fechada e verificando que a recusa sobrevive.

É a mesma ordem adotada no NODE-028 e no NODE-031, agora a terceira vez: virou
padrão do sistema, não decisão pontual.

## Quem recebe, e quem não

Exatamente **um** e-mail, para quem pediu a assinatura. Nenhum para o próprio
signatário, que já sabe o que fez — há teste afirmando as duas coisas.

E recusa que a API rejeita (403, quando quem tenta não é o signatário indicado)
**não dispara e-mail nenhum**: um aviso enviado nesse caso vazaria a existência da
solicitação.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Um e-mail ao solicitante, nenhum ao signatário | EVD-001 |
| 2 | Corpo com documento, quem recusou e o motivo | EVD-002 |
| 3 | Falha de SMTP não desfaz a recusa | EVD-003 |
| 4 | Método nas três implementações | EVD-004 |
| 5 | Verificado contra SMTP real | EVD-005 |
| 6 | Sem modelo nem migração | EVD-006 |

## Verificado contra Mailpit, não só com a fronteira simulada

```
De:      ged@exemplo.com
Para:    ana@exemplo.com
Assunto: Assinatura recusada: Contrato principal
contém 'Contrato principal' · 'bruno' · 'Valor divergente na cláusula 4.'
```

O `SMTPEmailSender` foi construído **sem usuário e sem senha**, reproduzindo o
relay do Google Workspace por IP que o GAP-003 escolheu.

## Um teste que mudei porque estava mal escrito

O item 6 pede que nenhuma migração seja introduzida. Escrevi primeiro uma
contagem de arquivos — e errei o número (são 6, não 4). Contagem fixa é frágil e
não diz nada de útil: quebraria na próxima migração legítima sem apontar problema
algum.

Reescrevi para afirmar que **a cabeça do alembic não se moveu** — continua sendo
`e5f6a7b8c9d0`, a última da DEM-002. Isso expressa o que o contrato quer dizer.

## Limitações conhecidas

- **Sem interface ainda.** Recusar pela tela é o NODE-044; hoje só a API notifica.
- **Cancelamento por administrador continua sem notificar** quem pediu — registrado
  como pendência na resolução do GAP-009 e fora do escopo desta demanda.
- **Texto puro, sem template HTML** — atravessa qualquer cliente e dispensa
  sanitização.
- **A verificação com Mailpit foi manual**, subindo o container à mão. O E2E do
  NODE-047 a incorpora ao `docker-compose.test.yml`.
