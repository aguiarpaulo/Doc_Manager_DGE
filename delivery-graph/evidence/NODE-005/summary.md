# NODE-005 — Documentos (metadados e categorias)

## O que foi implementado

- `app/models/document.py` — modelo `Document` (id, nome, obra_id FK, categoria, status, criado_por FK, criado_em, `is_deleted`, `current_version`); enums `Category` (contrato/projeto/nota_fiscal/licenca/laudo/outros) e `DocumentStatus` (enviado/em_analise/aprovado/rejeitado).
- `app/schemas/document.py` — `DocumentCreate`/`DocumentRead`.
- `app/api/documents.py` — `POST /documents` (cria metadados; exige acesso à obra via escopo; status inicial Enviado; criado_por = usuário autenticado) e `GET /documents/{id}` (com escopo, 404 fora). Helper `get_visible_document` reutilizável.
- `tests/conftest.py` — fixture `make_obra` (cria obra e atribui usuários).
- `tests/test_documents.py` — cobre os 3 itens do contrato + caso de obra inacessível.

## Contrato de validação (pytest)

1. **criar documento persiste campos e associa a obra existente** — `test_create_document_persists_fields_and_links_obra` (inclui round-trip via GET).
2. **categoria fora da lista permitida é rejeitada** — `test_invalid_category_is_rejected` (422).
3. **documento nasce Enviado e criado_por = usuário autenticado** — `test_document_starts_enviado_and_creator_is_current_user`.

Extra: `test_cannot_create_document_in_inaccessible_obra` (404 fora do escopo).

Suite total: 24 passed, ruff limpo.
