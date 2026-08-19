# NODE-028 — E-mail de solicitação de assinatura

**Demanda:** DEM-002 · **Track:** TRK-signature-api · **Requisito:** REQ-021
**Depende de:** NODE-027, NODE-021 (`done`) · **Contrato: 6/6**

## O que entrou

| Arquivo | Mudança |
|---|---|
| `app/services/email.py` | `send_signature_request` nas 3 implementações + `validate_email_config` + `signature_link` |
| `app/config.py` | `GED_APP_URL_BASE` |
| `app/main.py` | Validação de configuração na subida |
| `app/api/documents.py` | Envio após a criação da solicitação |
| `.env.example` | `GED_APP_URL_BASE` e `GED_SMTP_FROM` documentadas |

**157 testes** (16 novos), `ruff` limpo.

## A armadilha que este nó existe para travar

O alvo escolhido no GAP-003 é o **relay do Google Workspace autenticado por IP
allowlist** — o que significa que **não há `GED_SMTP_USER`**. E o código já
existente fazia `from_addr=settings.smtp_from or settings.smtp_user`.

Com o relay por IP, esse fallback cai num usuário vazio: **todo e-mail sai com
`From` em branco e o relay recusa**. Um erro assim apareceria só no log, um
e-mail não entregue por vez, semanas depois do deploy.

`validate_email_config` roda em `create_app()` e **recusa a subida** quando
`GED_SMTP_HOST` está definido sem remetente. Também recusa sem
`GED_APP_URL_BASE`, que produziria e-mails com link quebrado. Sem
`GED_SMTP_HOST`, nada é exigido — desenvolvimento continua sem configuração
alguma.

## Verificado contra um SMTP de verdade, não só com a fronteira simulada

Subi um Mailpit e enviei pelo `SMTPEmailSender` **construído sem usuário e sem
senha**, reproduzindo o relay por IP:

```
mensagens recebidas: 1
  De:       ged@exemplo.com
  Para:     bruno@exemplo.com
  Assunto:  Assinatura solicitada: Contrato principal
  contém 'Contrato principal': True
  contém 'Residencial Aurora': True
  contém 'ana': True
  contém '/documentos/abc-123/assinar': True
```

A conexão sem credencial funciona porque `server.login` só é chamado quando há
usuário **e** senha — condição que já existia no código e que este nó preservou
deliberadamente, com teste afirmando que ela continua lá.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Exatamente um e-mail ao signatário | EVD-001 |
| 2 | Corpo com documento, obra, solicitante e link | EVD-002 (SMTP real) |
| 3 | Falha de SMTP não desfaz a solicitação | EVD-003 |
| 4 | Subida recusada sem `GED_SMTP_FROM` | EVD-004 |
| 5 | `ConsoleEmailSender` é o caminho de dev | EVD-005 |
| 6 | `InMemoryEmailSender` captura em teste | EVD-006 |

## Decisões

**O envio acontece depois do commit da solicitação, e sua falha não a desfaz.**
A pendência fica visível no aplicativo de qualquer forma: perder o e-mail é
recuperável, perder a solicitação não seria. Há teste apontando um
`SMTPEmailSender` para uma porta fechada e verificando que a solicitação
sobrevive.

**Uma base pública só.** `GED_APP_URL_BASE` alimenta tanto o link de assinatura
quanto o de reset (que passa a ser derivado quando `GED_RESET_URL_BASE` não é
informado). Manter duas bases é como elas divergem.

**Solicitação recusada não notifica ninguém** — há teste, porque um 403 que
mesmo assim dispara e-mail vaza a existência do documento.

## Limitações conhecidas

- **Sem reenvio nem lembrete.** Se o e-mail se perder, a pessoa ainda vê a
  pendência no aplicativo (NODE-038), mas não há botão de reenviar.
- **Sem template HTML.** Texto puro, que atravessa qualquer cliente e não precisa
  de sanitização.
- **A validação de subida não testa conectividade.** Ela pega configuração
  ausente, não um host errado ou porta bloqueada — isso só aparece no primeiro
  envio, e por desenho não derruba a operação.
- **O Mailpit ainda não está no `docker-compose.test.yml`.** A verificação deste
  nó subiu o container à mão; integrá-lo ao compose é contrato do NODE-040.
