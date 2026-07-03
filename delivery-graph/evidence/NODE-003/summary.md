# NODE-003 — Usuários & papéis (RBAC)

## O que foi implementado

- `app/dependencies.py` — `require_roles(*roles)` (factory de dependência RBAC) e `require_admin`.
- `app/schemas/user.py` — `UserCreate` (role via enum `Role`, valida papel), `UserUpdate` (role/is_active), `UserRead`.
- `app/api/users.py` — router `/users` protegido por `require_admin`: `POST` cria, `GET` lista, `PATCH /{id}` atualiza papel/ativação. E-mail duplicado → 409.
- `tests/conftest.py` — fixture `auth_headers` (cria usuário com papel e devolve Bearer).
- `tests/test_users.py` — cobre os 3 itens do contrato.

## Contrato de validação (pytest)

1. **admin cria usuário com papel; não-admin recebe 403** — `test_admin_creates_user_with_role`, `test_non_admin_cannot_create_user` (401 quando sem credenciais).
2. **papel inválido é rejeitado na validação** — `test_invalid_role_is_rejected_by_validation` (422 do Pydantic para papel fora do enum).
3. **usuário desativado não consegue autenticar** — `test_deactivated_user_cannot_authenticate` (admin desativa via PATCH; login subsequente → 401).

Suite total: 15 passed, ruff limpo.
