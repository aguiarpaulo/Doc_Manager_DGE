# NODE-017 — Durabilidade (backup + redundância)

## O que foi implementado

- `scripts/backup_postgres.py` — rotina cron-able: roda `pg_dump` dentro do container postgres:16 (versão do servidor) e grava dump timestamped em `./backups`; valida que o dump tem schema.
- `scripts/restore_postgres.py` — procedimento de restauração testado: restaura o dump mais recente num banco scratch e confirma que o schema (`users`) está presente.
- `scripts/smoke_minio_persistence.py` — smoke: grava objeto, força recriação do container MinIO e verifica que o objeto sobrevive (volume persistente).
- `docker-compose.backup.yml` — overlay com serviço `backup` que roda pg_dump diariamente (a cada 24h) para `./backups`, com poda de dumps > 14 dias.
- `docker-compose.yml` — portas do MinIO (9000/9001) publicadas; volumes nomeados `pg_data`, `minio_data` garantem persistência.
- `/backups/` adicionado ao `.gitignore`.

## Contrato de validação (executado contra o stack ao vivo)

1. **rotina de backup diário (pg_dump) executável e documentada** — `scripts/backup_postgres.py` → `BACKUP OK ... (11373 bytes)`, exit 0. Agendamento em `docker-compose.backup.yml`.
2. **arquivos MinIO em volume persistente sobrevivem à recriação do container** — `scripts/smoke_minio_persistence.py` → objeto sobreviveu a `--force-recreate`, exit 0.
3. **procedimento de restauração documentado e testado** — `scripts/restore_postgres.py` → dump restaurado num banco scratch, tabela `users` presente, exit 0.

Redundância de arquivos: volume Docker nomeado `minio_data` (persistência confirmada pelo smoke).
