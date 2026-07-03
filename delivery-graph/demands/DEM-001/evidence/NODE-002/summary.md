# NODE-002 Evidence

Node: Autenticacao: bcrypt, login, JWT access+refresh

## Items

- EVD-001 [command] satisfies `pytest: login valido retorna access+refresh token`: .venv/Scripts/pytest.exe tests/test_auth.py -k test_login_valid_returns_access_and_refresh -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: senha invalida retorna 401 sem revelar se o e-mail existe`: .venv/Scripts/pytest.exe tests/test_auth.py -k wrong_password or unknown_email -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: senha persistida como hash bcrypt`: .venv/Scripts/pytest.exe tests/test_auth.py -k test_password_is_stored_as_bcrypt_hash -q passed
  - Artifact: artifacts/EVD-003-command.json
- EVD-004 [command] satisfies `pytest: refresh valido gera novo access; invalido/expirado retorna 401`: .venv/Scripts/pytest.exe tests/test_auth.py -k refresh -q passed
  - Artifact: artifacts/EVD-004-command.json
