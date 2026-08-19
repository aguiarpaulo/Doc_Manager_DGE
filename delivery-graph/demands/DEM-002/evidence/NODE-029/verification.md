# NODE-029 Verification

Node: Ato de assinar: confirmacao por senha + snapshot imutavel da rubrica + registro do signatario data-hora e versao
Verified: 2026-08-19T12:54:55.401Z

## Required evidence

- Senha correta conclui a assinatura e grava signatario + data-hora + versao assinada: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_signing.py -q -k correct_password passed
    - Artifact: artifacts/EVD-001-command.json
- A rubrica e copiada como snapshot no ato da assinatura e a assinatura sobrevive intacta a troca ou exclusao da rubrica de perfil do titular: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_signing.py -q -k rubric_is_copied or survives_the_owner or keeps_the_old_mark or holds_both passed
    - Artifact: artifacts/EVD-002-command.json
- Senha incorreta recusa a assinatura e a solicitacao permanece pendente: satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_signing.py -q -k wrong_password or open_session passed
    - Artifact: artifacts/EVD-003-command.json
- Somente o signatario indicado consegue assinar aquela solicitacao; outro usuario recebe 403: satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_signing.py -q -k only_the_named or administrator_cannot_sign or another_document passed
    - Artifact: artifacts/EVD-004-command.json
- Assinar uma solicitacao ja assinada e rejeitado: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest tests/test_signing.py -q -k signing_twice passed
    - Artifact: artifacts/EVD-005-command.json
- Assinar nao altera o status de aprovacao do documento nem cria nova versao: satisfied
  - EVD-006 [command]: .venv/Scripts/python.exe -m pytest tests/test_signing.py -q -k does_not_touch_the_approval passed
    - Artifact: artifacts/EVD-006-command.json
