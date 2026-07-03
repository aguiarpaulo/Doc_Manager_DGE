# NODE-012 — Recuperação de senha (esqueci minha senha)

## O que foi implementado

- `app/models/password_reset.py` — `PasswordResetToken` (user_id, token_hash SHA-256, expires_at, used, created_at). Token guardado **hasheado**.
- `app/services/email.py` — abstração `EmailSender` (Protocol) com `ConsoleEmailSender` (dev, loga token via structlog) e `InMemoryEmailSender` (testes). **GAP-001**: o provedor SMTP de produção segue em aberto; só `get_email_sender` muda quando definido.
- `app/services/password_reset.py` — `create_reset_token` (uso único, expiração via `reset_token_expire_minutes`) e `reset_password` (valida existência/uso/expiração, grava nova senha em bcrypt, marca token usado).
- `app/api/auth.py` — `POST /auth/forgot-password` (resposta genérica idêntica, sem vazar existência) e `POST /auth/reset-password`.
- `tests/test_password_reset.py` — cobre os 3 itens do contrato.

## Contrato de validação (pytest)

1. **solicitar reset gera token de uso único com expiração sem revelar existência** — `test_request_generates_single_use_token_without_leaking`.
2. **token válido troca senha; usado/expirado rejeitado** — `test_valid_token_resets_and_used_or_expired_rejected` + `test_expired_token_is_rejected`.
3. **nova senha em bcrypt e token invalidado** — `test_new_password_is_bcrypt_and_token_invalidated`.

## Gap relacionado

- **GAP-001** (provedor SMTP) permanece aberto e não bloqueia: o fluxo funciona com `ConsoleEmailSender` em dev; produção só precisa plugar um `EmailSender` SMTP em `get_email_sender`.

Suite total: 49 passed, ruff limpo.
