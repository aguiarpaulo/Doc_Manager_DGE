# NODE-006 — Upload para MinIO + validação

## O que foi implementado

- `app/storage.py` — abstração `ObjectStorage` (Protocol) com `MinioStorage` (cliente MinIO, cria bucket se necessário) e `InMemoryStorage` (fake para testes); dependência `get_storage`.
- `app/models/document_version.py` — `DocumentVersion` (document_id, version, object_key, tamanho, tipo, hash SHA-256, criado_por, criado_em).
- `app/services/uploads.py` — `store_new_version`: valida tipo (PDF/PNG/JPEG) e tamanho (≤50MB), calcula SHA-256, bloqueia hash duplicado **na mesma obra** (409), grava objeto no storage e registra a versão (número incremental).
- `app/schemas/document_version.py` — `DocumentVersionRead`.
- `app/api/documents.py` — `POST /documents/{id}/versions` (multipart, escopo aplicado).
- `tests/conftest.py` — override de `get_storage` por `InMemoryStorage`; fixture `make_document`.
- `tests/test_uploads.py` — cobre os 3 itens do contrato.

## Contrato de validação (pytest)

1. **upload PDF/PNG/JPEG válido persiste objeto no MinIO e metadados** — `test_valid_upload_persists_object_and_metadata` (verifica tamanho/tipo/hash e objeto no storage).
2. **tipo não permitido ou > 50MB é rejeitado** — `test_disallowed_type_is_rejected` (400), `test_oversized_file_is_rejected` (413).
3. **hash SHA-256 idêntico na mesma obra é sinalizado** — `test_duplicate_hash_in_same_obra_is_flagged` (409).

Suite total: 28 passed, ruff limpo.
