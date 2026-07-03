# NODE-013 Evidence

Node: MFA via TOTP opt-in por usuario

## Items

- EVD-001 [command] satisfies `pytest: ativar MFA gera segredo TOTP`: .venv/Scripts/pytest.exe tests/test_mfa.py -k generates_secret -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `pytest: com MFA ativo, login sem codigo valido e negado`: .venv/Scripts/pytest.exe tests/test_mfa.py -k denied_without -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `pytest: com MFA ativo, login com codigo TOTP valido e aceito`: .venv/Scripts/pytest.exe tests/test_mfa.py -k accepted_with -q passed
  - Artifact: artifacts/EVD-003-command.json
