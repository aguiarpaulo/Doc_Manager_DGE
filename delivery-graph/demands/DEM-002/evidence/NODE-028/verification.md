# NODE-028 Verification

Node: E-mail de solicitacao de assinatura: send_signature_request nas quatro implementacoes + GED_APP_URL_BASE + validacao de config na subida
Verified: 2026-08-19T12:45:31.407Z

## Required evidence

- Criar solicitacao envia exatamente um e-mail ao endereco do signatario: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_request_email.py -q -k exactly_one_email or no_email_is_sent passed
    - Artifact: artifacts/EVD-001-command.json
- O corpo traz nome do documento + obra + quem solicitou + link derivado de GED_APP_URL_BASE apontando para a rota de assinatura da SPA: satisfied
  - EVD-002 [manual]: Verificado contra um SMTP real (Mailpit), nao so com a fronteira simulada: a mensagem chegou com From ged@exemplo.com, assunto 'Assinatura solicitada: Contrato principal' e corpo contendo o documento, a obra, o solicitante e o link /documentos/{id}/assinar derivado de GED_APP_URL_BASE. O sender foi construido sem usuario e sem senha, reproduzindo o relay por IP.
    - Artifact: artifacts/EVD-002-PROOF-email-smtp-real.txt
- Falha de SMTP nao impede a criacao da solicitacao e e registrada em log: satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_request_email.py -q -k smtp_failure or smtp_errors passed
    - Artifact: artifacts/EVD-003-command.json
- A aplicacao recusa subir quando GED_SMTP_HOST esta definido e GED_SMTP_FROM esta vazio (com relay por IP o fallback para smtp_user produziria um cabecalho From em branco): satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_request_email.py -q -k startup passed
    - Artifact: artifacts/EVD-004-command.json
- Sem GED_SMTP_HOST o ConsoleEmailSender continua sendo o caminho de desenvolvimento: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_request_email.py -q -k console_sender or without_smtp_host or smtp_sender_is_selected passed
    - Artifact: artifacts/EVD-005-command.json
- InMemoryEmailSender captura a mensagem em teste sem servico externo: satisfied
  - EVD-006 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_request_email.py -q -k in_memory_sender passed
    - Artifact: artifacts/EVD-006-command.json
