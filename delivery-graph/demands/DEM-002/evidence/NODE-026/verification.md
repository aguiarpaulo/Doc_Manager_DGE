# NODE-026 Verification

Node: Rubrica: modelo + armazenamento em MinIO sob prefixo rubricas/ + delete_object no protocolo ObjectStorage
Verified: 2026-08-19T12:03:02.978Z

## Required evidence

- Rubrica gravada como PNG sob prefixo rubricas/ no bucket existente com metadado no Postgres: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q passed
    - Artifact: artifacts/EVD-001-command.json
- Apenas o titular grava e le a propria rubrica; administrador recebe 403 ao tentar gravar ou ler rubrica alheia: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k own or someone or each_user passed
    - Artifact: artifacts/EVD-002-command.json
- Nenhum endpoint devolve rubrica por user_id de terceiro e nenhuma URL presigned e exposta: satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k addresses_a_rubric_by_user_id or never_returns_the_image passed
    - Artifact: artifacts/EVD-003-command.json
- delete_object adicionado as tres implementacoes de ObjectStorage (protocolo InMemory e MinIO) com teste em cada: satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k delete passed
    - Artifact: artifacts/EVD-004-command.json
- Titular consegue apagar a propria rubrica de perfil e o objeto some do armazenamento: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k deletes_own_rubric passed
    - Artifact: artifacts/EVD-005-command.json
- Desativar usuario nao apaga a rubrica porque desativacao preserva o cadastro para reativacao: satisfied
  - EVD-006 [command]: .venv/Scripts/python.exe -m pytest tests/test_signatures.py -q -k deactivating passed
    - Artifact: artifacts/EVD-006-command.json
