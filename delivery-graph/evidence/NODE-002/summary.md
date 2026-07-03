# NODE-002 — Autenticação (bcrypt, JWT access+refresh)

## O que foi implementado

- `app/models/user.py` — modelo `User` (id UUID, email único, hashed_password, role, is_active, campos MFA) e enum `Role` (administrador/diretor/engenheiro/financeiro).
- `app/security.py` — `hash_password`/`verify_password` via **bcrypt**; `create_access_token`/`create_refresh_token`/`decode_token` via **PyJWT**, com claim `type` distinguindo access de refresh e checagem de tipo em `decode_token`.
- `app/schemas/auth.py` — schemas de login/refresh/token.
- `app/api/auth.py` — `POST /auth/login` (retorna access+refresh; falha genérica `Credenciais inválidas` para e-mail desconhecido, senha errada ou conta inativa — não vaza existência) e `POST /auth/refresh` (valida refresh, emite novo access; token inválido/expirado/tipo errado → 401).
- `app/dependencies.py` — `get_db` e `get_current_user` (base para os próximos nós).
- `tests/conftest.py` — fixtures herméticas: SQLite em memória, client com override de `get_db`, factory `make_user`.
- `tests/test_auth.py` — cobre os 4 itens do contrato.

## Contrato de validação (pytest)

1. **login válido retorna access+refresh** — `test_login_valid_returns_access_and_refresh`.
2. **senha inválida → 401 sem vazar e-mail** — `test_login_wrong_password_is_401_without_leaking` + `test_login_unknown_email_same_response_as_wrong_password` (mensagem idêntica nos dois casos).
3. **senha persistida como hash bcrypt** — `test_password_is_stored_as_bcrypt_hash` (prefixo `$2b$`).
4. **refresh válido gera novo access; inválido/expirado → 401** — `test_refresh_valid_returns_new_access_token`, `test_refresh_with_invalid_token_is_401`, `test_refresh_rejects_access_token_used_as_refresh`.

Total: 10 passed, ruff limpo.
