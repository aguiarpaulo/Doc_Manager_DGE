# NODE-013 Verification

Node: MFA via TOTP opt-in por usuario
Verified: 2026-07-03T19:27:26.172Z

## Required evidence

- pytest: ativar MFA gera segredo TOTP: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_mfa.py -k generates_secret -q passed
    - Artifact: artifacts/EVD-001-command.json
- pytest: com MFA ativo, login sem codigo valido e negado: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_mfa.py -k denied_without -q passed
    - Artifact: artifacts/EVD-002-command.json
- pytest: com MFA ativo, login com codigo TOTP valido e aceito: satisfied
  - EVD-003 [command]: .venv/Scripts/pytest.exe tests/test_mfa.py -k accepted_with -q passed
    - Artifact: artifacts/EVD-003-command.json
