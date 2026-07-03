# NODE-004 — Obras + atribuição N:N + enforcement de escopo

## O que foi implementado

- `app/models/obra.py` — modelo `Obra` (id, nome, descricao, created_at) e tabela de associação N:N `user_obra`; relationship `Obra.users` / `User.obras`.
- `app/scope.py` — regras de escopo centralizadas: `has_global_access` (Admin/Diretor), `scope_obra_query` (filtra select por atribuição), `accessible_obra_ids`, `can_access_obra`. **Todo acesso a obra passa por aqui.**
- `app/schemas/obra.py` — `ObraCreate`/`ObraUpdate`/`ObraRead`.
- `app/api/obras.py` — `POST`/`PATCH` obras (admin), `GET` (lista/detalhe com escopo aplicado; fora do escopo → 404 sem vazar existência), `PUT`/`DELETE /obras/{id}/users/{user_id}` (atribuir/remover, admin).
- `tests/conftest.py` — fixture `headers_for` (headers para usuário existente).
- `tests/test_obras.py` — cobre os 4 itens do contrato.

## Contrato de validação (pytest)

1. **admin cria/edita obra; não-admin recebe 403** — `test_admin_creates_and_edits_obra`, `test_non_admin_cannot_create_or_edit_obra`.
2. **admin atribui/remove obra de um usuário** — `test_admin_assigns_and_unassigns_obra_to_user`.
3. **engenheiro/financeiro só acessam obras atribuídas (404 fora do escopo)** — `test_engenheiro_and_financeiro_only_see_assigned_obras`.
4. **diretor e admin acessam todas as obras sem atribuição** — `test_diretor_and_admin_see_all_obras_without_assignment`.

Suite total: 20 passed, ruff limpo.
