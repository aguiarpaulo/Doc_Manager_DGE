# NODE-012 Evidence

Node: Recuperacao de senha via token de uso unico com expiracao (esqueci minha senha)

## Items

- EVD-001 [command] satisfies `pytest: solicitar reset gera token de uso unico com expiracao sem revelar se o e-mail existe`: .venv/Scripts/pytest.exe tests/test_password_reset.py -k without_leaking -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: token valido troca a senha; token usado/expirado e rejeitado`: .venv/Scripts/pytest.exe tests/test_password_reset.py -k resets_and_used or expired_token -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: nova senha gravada em bcrypt e token invalidado`: .venv/Scripts/pytest.exe tests/test_password_reset.py -k bcrypt_and_token -q passed
  - Artifact: artifacts/EVD-003-command.json
