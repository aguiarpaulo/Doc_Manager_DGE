# NODE-002 Verification

Node: Autenticacao: bcrypt, login, JWT access+refresh
Verified: 2026-07-03T18:32:31.199Z

## Required evidence

- pytest: login valido retorna access+refresh token: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_auth.py -k test_login_valid_returns_access_and_refresh -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: senha invalida retorna 401 sem revelar se o e-mail existe: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_auth.py -k wrong_password or unknown_email -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: senha persistida como hash bcrypt: satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_auth.py -k test_password_is_stored_as_bcrypt_hash -q passed
    - Artifact: artifacts/EVD-003-command.json
- pytest: refresh valido gera novo access; invalido/expirado retorna 401: satisfied
  - EVD-004 [command]: .venv/Scripts/pytest.exe tests/test_auth.py -k refresh -q passed
    - Artifact: artifacts/EVD-004-command.json
