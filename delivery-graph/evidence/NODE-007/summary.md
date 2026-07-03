# NODE-007 — Versionamento de documentos

## O que foi implementado

- `app/models/document.py` — coluna `approved_version` (int|None) para registrar qual versão foi aprovada.
- `app/services/approval.py` — máquina de estados de aprovação (transições permitidas) e `reset_for_new_version` (nova versão → status Enviado, `approved_version=None`); `approve` grava `approved_version = current_version`.
- `app/services/uploads.py` — `store_new_version` agora chama `reset_for_new_version` após incrementar a versão. Cada versão é gravada sob chave distinta (`{obra}/{doc}/v{n}/{arquivo}`), preservando as anteriores.
- `tests/test_versioning.py` — cobre os 3 itens do contrato.

## Contrato de validação (pytest)

1. **re-upload incrementa versão e preserva o objeto anterior** — `test_reupload_increments_and_preserves_previous_object` (v1→v2, 2 objetos retidos no storage).
2. **nova versão reseta o status para Enviado** — `test_new_version_resets_status_to_enviado` (documento Aprovado volta a Enviado após re-upload).
3. **aprovação refere-se à versão aprovada** — `test_approval_refers_to_approved_version` (`approved_version==1`; nova versão limpa a aprovação e volta a Enviado).

Suite total: 31 passed, ruff limpo.
