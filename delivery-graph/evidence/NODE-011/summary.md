# NODE-011 — Exclusão soft-delete (Admin, auditada)

## O que foi implementado

- `app/api/documents.py` — `DELETE /documents/{id}` restrito a Administrador (`require_admin`). Marca `is_deleted=True` (não apaga linha, versões nem objetos no storage) e registra evento `AuditAction.DELETE`.
- Documentos removidos já ficam ocultos: `get_visible_document` retorna 404 e a busca exclui `is_deleted`.
- `tests/test_soft_delete.py` — cobre os 3 itens do contrato.

## Contrato de validação (pytest)

1. **apenas admin exclui; demais recebem 403** — `test_only_admin_can_delete` (engenheiro e diretor → 403).
2. **soft-delete marca removido sem apagar objeto/versões** — `test_soft_delete_retains_versions_and_objects` (`is_deleted=True`, versões e objetos do storage preservados).
3. **removido some de listagens/buscas e evento é auditado** — `test_deleted_document_is_hidden_and_delete_is_audited` (GET 404, busca vazia, 1 evento DELETE).

Suite total: 45 passed, ruff limpo.
