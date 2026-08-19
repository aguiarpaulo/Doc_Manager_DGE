# NODE-030 Verification

Node: Recusa com justificativa e cancelamento de pendencia
Verified: 2026-08-19T13:00:41.358Z

## Required evidence

- Recusar exige justificativa nao vazia: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k without_a_reason or reason_is_trimmed passed
    - Artifact: artifacts/EVD-001-command.json
- A recusa encerra a pendencia e registra autor + horario + justificativa: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k declining_records passed
    - Artifact: artifacts/EVD-002-command.json
- Cancelar uma pendencia so e permitido ao solicitante ou a um administrador: satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k requester_may_cancel or administrator_may_cancel or unrelated_colleague or cancelling_without_a_reason passed
    - Artifact: artifacts/EVD-003-command.json
- Signatario recebe 403 ao tentar cancelar solicitacao dirigida a outra pessoa: satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k signatory_may_not_cancel or only_the_signatory_may_refuse passed
    - Artifact: artifacts/EVD-004-command.json
- Pendencia recusada ou cancelada nao pode mais ser assinada: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_decline_cancel.py -q -k no_longer_be_signed or no_longer_be_refused or refusing_twice or frees_a_new_one passed
    - Artifact: artifacts/EVD-005-command.json
