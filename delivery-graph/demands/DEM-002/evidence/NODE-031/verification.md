# NODE-031 Verification

Node: Nova versao cancela automaticamente as pendencias daquela versao e notifica os signatarios
Verified: 2026-08-19T13:08:24.093Z

## Required evidence

- Enviar nova versao com 2 pendencias abertas deixa as 2 canceladas: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_new_version_cancels_requests.py -q -k cancels_both_open passed
    - Artifact: artifacts/EVD-001-command.json
- O cancelamento automatico gera registro com o motivo e notifica cada signatario afetado: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_new_version_cancels_requests.py -q -k records_the_reason or every_affected_signatory or without_pending passed
    - Artifact: artifacts/EVD-002-command.json
- Assinaturas ja concluidas continuam consultaveis e permanecem vinculadas a versao em que foram feitas: satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_new_version_cancels_requests.py -q -k already_applied_survive passed
    - Artifact: artifacts/EVD-003-command.json
- Depois do cancelamento nenhum signatario consegue assinar a solicitacao antiga: satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_new_version_cancels_requests.py -q -k no_longer_be_signed or made_again_on_the_new_version passed
    - Artifact: artifacts/EVD-004-command.json
- O comportamento existente de reset_for_new_version continua valendo e nao e alterado por este no: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest tests/test_new_version_cancels_requests.py -q -k reset_behaviour_is_unchanged passed
    - Artifact: artifacts/EVD-005-command.json
