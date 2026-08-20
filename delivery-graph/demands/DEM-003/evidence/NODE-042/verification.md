# NODE-042 Verification

Node: E-mail de recusa ao solicitante (API)
Verified: 2026-08-19T17:50:27.520Z

## Required evidence

- Recusar envia exatamente um e-mail ao solicitante da assinatura e nenhum ao proprio signatario: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k notifies_the_requester or no_email_when_the_refusal_is_refused passed
    - Artifact: artifacts/EVD-001-command.json
- O corpo traz nome do documento quem recusou e a justificativa informada: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k carries_document_signer_and_reason passed
    - Artifact: artifacts/EVD-002-command.json
- Falha de SMTP nao desfaz a recusa e e registrada em log (mesma ordem do NODE-028: envio depois do commit): satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k smtp_failure_does_not_undo_the_refusal passed
    - Artifact: artifacts/EVD-003-command.json
- send_signature_declined existe nas tres implementacoes do protocolo EmailSender: satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k console_sender_logs_the_refusal or notifies_the_requester passed
    - Artifact: artifacts/EVD-004-command.json
- Verificado contra um SMTP real (Mailpit) e nao apenas com InMemoryEmailSender (licao do NODE-015): satisfied
  - EVD-005 [manual]: Mailpit real recebeu a mensagem enviada por um SMTPEmailSender construido sem usuario e sem senha (relay por IP): De ged@exemplo.com, Para ana@exemplo.com, assunto 'Assinatura recusada: Contrato principal', e o corpo contendo o documento o signatario e a justificativa.
    - Artifact: artifacts/EVD-005-PROOF-email-recusa-smtp-real.txt
- Nenhuma alteracao de modelo ou migracao foi introduzida: satisfied
  - EVD-006 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k no_model_or_migration passed
    - Artifact: artifacts/EVD-006-command.json
