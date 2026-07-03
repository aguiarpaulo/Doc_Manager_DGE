# NODE-017 Evidence

Node: Durabilidade: backup diario do PostgreSQL e redundancia MinIO via volumes persistentes

## Items

- EVD-001 [command] satisfies `artefato: rotina de backup diario do PostgreSQL (pg_dump) executavel e documentada`: .venv/Scripts/python.exe scripts/backup_postgres.py passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `smoke: arquivos MinIO em volume persistente sobrevivem a recriacao do container`: .venv/Scripts/python.exe scripts/smoke_minio_persistence.py passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `artefato: procedimento de restauracao do backup documentado e testado`: .venv/Scripts/python.exe scripts/restore_postgres.py passed
  - Artifact: artifacts/EVD-003-command.json
