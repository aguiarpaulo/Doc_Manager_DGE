# NODE-017 Verification

Node: Durabilidade: backup diario do PostgreSQL e redundancia MinIO via volumes persistentes
Verified: 2026-07-03T20:07:01.274Z

## Required evidence

- artefato: rotina de backup diario do PostgreSQL (pg_dump) executavel e documentada: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe scripts/backup_postgres.py passed
    - Artifact: artifacts/EVD-001-command.json
- smoke: arquivos MinIO em volume persistente sobrevivem a recriacao do container: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe scripts/smoke_minio_persistence.py passed
    - Artifact: artifacts/EVD-002-command.json
- artefato: procedimento de restauracao do backup documentado e testado: satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe scripts/restore_postgres.py passed
    - Artifact: artifacts/EVD-003-command.json
