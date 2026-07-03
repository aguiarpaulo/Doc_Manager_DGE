# NODE-013 — MFA via TOTP (opt-in)

## O que foi implementado

- `app/services/mfa.py` — helpers TOTP via `pyotp`: `generate_secret`, `provisioning_uri`, `verify_code` (janela ±1).
- `app/api/auth.py` — `POST /auth/mfa/enable` (autenticado): gera segredo, ativa MFA, devolve `secret` + `otpauth_uri`. Login agora exige código TOTP válido quando `mfa_enabled`.
- Campos `mfa_secret`/`mfa_enabled` já existiam no `User`.
- `tests/test_mfa.py` — cobre os 3 itens do contrato.

## Contrato de validação (pytest)

1. **ativar MFA gera segredo TOTP** — `test_enable_mfa_generates_secret` (secret + otpauth URI).
2. **com MFA ativo, login sem código válido é negado** — `test_login_denied_without_valid_code_when_mfa_enabled` (sem código e código errado → 401).
3. **com MFA ativo, login com código TOTP válido é aceito** — `test_login_accepted_with_valid_code_when_mfa_enabled`.

Suite total: 52 passed, ruff limpo.
