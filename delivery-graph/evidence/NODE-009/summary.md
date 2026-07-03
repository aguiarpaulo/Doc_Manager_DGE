# NODE-009 — Auditoria imutável

## O que foi implementado

- `app/models/audit.py` — `AuditLog` (actor_id, action, target_type, target_id, detail, created_at) e enum `AuditAction` (login/upload/download/approve/reject/delete).
- `app/services/audit.py` — `record(...)` append-only (add + flush; commit pelo chamador).
- `app/schemas/audit.py` — `AuditLogRead`.
- Wiring de eventos: `login` (auth), `upload`/`download`/`approve`/`reject` (documents). Foi adicionado o endpoint `GET /documents/{id}/versions/{v}/download` (necessário para o evento de download).
- `GET /documents/{id}/history` — histórico do documento em ordem cronológica (escopo aplicado).
- Imutabilidade: nenhuma rota de edição/remoção de auditoria é exposta.
- `tests/test_audit.py` — cobre os 3 itens do contrato.

## Contrato de validação (pytest)

1. **cada ação relevante gera registro com autor, ação, alvo e timestamp** — `test_relevant_actions_are_audited_with_actor_action_target_timestamp` (login, upload, download, approve).
2. **histórico do documento consultável em ordem cronológica** — `test_document_history_is_chronological`.
3. **registros de auditoria não podem ser editados/apagados via API** — `test_audit_records_have_no_mutation_endpoints` (DELETE/PATCH/PUT em `/audit/...` → 404/405; superfície inexistente).

Suite total: 39 passed, ruff limpo.
