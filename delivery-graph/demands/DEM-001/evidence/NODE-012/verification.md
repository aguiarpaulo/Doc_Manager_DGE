# NODE-012 Verification

Node: Recuperacao de senha via token de uso unico com expiracao (esqueci minha senha)
Verified: 2026-07-03T19:23:50.956Z

## Required evidence

- pytest: solicitar reset gera token de uso unico com expiracao sem revelar se o e-mail existe: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_password_reset.py -k without_leaking -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: token valido troca a senha; token usado/expirado e rejeitado: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_password_reset.py -k resets_and_used or expired_token -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: nova senha gravada em bcrypt e token invalidado: satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_password_reset.py -k bcrypt_and_token -q passed
    - Artifact: artifacts/EVD-003-command.json
