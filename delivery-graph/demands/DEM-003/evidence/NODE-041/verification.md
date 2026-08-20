# NODE-041 Verification

Node: Confirmacao por senha ao apagar a rubrica (API)
Verified: 2026-08-19T17:32:00.504Z

## Required evidence

- DELETE /me/signature passa a exigir a senha do titular e recusa com 403 quando ela esta errada: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k wrong_password_refuses or empty_password or missing_body passed
    - Artifact: artifacts/EVD-001-command.json
- Senha errada nao apaga nada: a rubrica continua legivel e o objeto segue no armazenamento: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k wrong_password_refuses or another_users_password passed
    - Artifact: artifacts/EVD-002-command.json
- A rota continua sem id de usuario; apagar a rubrica alheia segue inexprimivel e nao apenas proibido: satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k delete_route_still_takes_no_user_id or addresses_a_rubric_by_user_id passed
    - Artifact: artifacts/EVD-003-command.json
- Apagar nao altera nenhuma assinatura ja aplicada nem o snapshot que cada uma guarda: satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k keeps_every_applied_signature passed
    - Artifact: artifacts/EVD-004-command.json
- A senha nao aparece em log nem em nenhuma coluna gravada: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k password_is_never_stored passed
    - Artifact: artifacts/EVD-005-command.json
- pytest e ruff passam integralmente (licao do NODE-025: mudanca de contrato de endpoint exige a suite inteira e nao so o arquivo tocado): satisfied
  - EVD-006 [command]: .venv/Scripts/python.exe -m pytest -q passed
    - Artifact: artifacts/EVD-006-command.json
  - EVD-007 [command]: .venv/Scripts/python.exe -m ruff check . passed
    - Artifact: artifacts/EVD-007-command.json
