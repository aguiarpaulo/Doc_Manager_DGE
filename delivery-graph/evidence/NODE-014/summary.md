# NODE-014 — Observabilidade (health + structlog)

## O que foi implementado

- `app/storage.py` — método `ping()` no protocolo `ObjectStorage` e implementações (MinIO: `bucket_exists`; InMemory: no-op).
- `app/api/health.py` — `GET /health` agora executa `SELECT 1` no banco e `storage.ping()` no MinIO; retorna `{"status", "checks": {database, storage}}`. Se qualquer dependência falha → HTTP 503 `unhealthy`. Emite log estruturado `health_check`.
- structlog já configurado app-wide (JSON) desde o scaffold.
- `tests/test_observability.py` — cobre os 3 itens do contrato; `tests/test_scaffold.py` atualizado para o novo formato de health.

## Contrato de validação (pytest)

1. **/health ok quando DB e MinIO respondem** — `test_health_ok_when_dependencies_up`.
2. **/health unhealthy quando uma dependência indisponível** — `test_health_unhealthy_when_dependency_down` (storage com `ping` falho → 503).
3. **logs em formato estruturado (structlog)** — `test_logs_are_structured_json` (evento JSON com timestamp/campos).

Suite total: 55 passed, ruff limpo.
