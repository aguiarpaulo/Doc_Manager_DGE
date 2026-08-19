# NODE-032 Verification

Node: Linha do tempo: AuditAction estendido com as acoes de assinatura e endpoint de etapas do documento
Verified: 2026-08-19T13:26:20.536Z

## Required evidence

- As nove acoes (upload nova versao envio para analise aprovacao rejeicao solicitacao assinatura recusa cancelamento) geram cada uma exatamente um registro com autor e horario: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_document_timeline.py -q -k every_step_of_the_journey or exactly_one_record or sending_to_review or first_upload_and_a_new_version or names_who_acted passed
    - Artifact: artifacts/EVD-001-command.json
- O endpoint de historico devolve as etapas em ordem cronologica: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_document_timeline.py -q -k chronological passed
    - Artifact: artifacts/EVD-002-command.json
- Etapas de assinatura trazem o nome do signatario e o horario da assinatura: satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_document_timeline.py -q -k signature_step_names or refusal_step_carries passed
    - Artifact: artifacts/EVD-003-command.json
- Nenhum endpoint permite editar ou apagar um registro da linha do tempo: satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_document_timeline.py -q -k edit_or_delete or read_only passed
    - Artifact: artifacts/EVD-004-command.json
- O escopo de obra e aplicado: usuario sem acesso a obra nao le a linha do tempo do documento: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest tests/test_document_timeline.py -q -k outside_the_obra or requires_authentication passed
    - Artifact: artifacts/EVD-005-command.json
