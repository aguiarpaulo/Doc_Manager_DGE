# NODE-015 Verification

Node: UI minima em Streamlit (login, listar/filtrar, upload, aprovar/rejeitar, historico)
Verified: 2026-07-03T19:44:21.508Z

## Required evidence

- smoke manual: login pela UI autentica contra a API: satisfied
  - EVD-001 [command]: .venv/Scripts/pytest.exe tests/test_streamlit_ui.py -k login or shows_login -q passed
    - Artifact: artifacts/EVD-001-command.json
- smoke manual: UI lista documentos no escopo e permite upload, aprovacao e busca: satisfied
  - EVD-002 [command]: .venv/Scripts/pytest.exe tests/test_streamlit_ui.py -k dashboard_lists or search_documents -q passed
    - Artifact: artifacts/EVD-002-command.json

## Re-verificacao 2026-08-04

A verificacao de 2026-07-03 aceitou pytest com a API mockada como "smoke manual".
Isso deixou passar um defeito bloqueante: o campo "Obra ID" do formulario "Novo
documento" era texto livre, e a API exige `uuid.UUID`, entao todo envio retornava
422 com traceback na tela. Corrigido na branch `fix/streamlit-obra-selectbox`
(seletor de obras por nome + erros da API renderizados na UI).

- smoke manual: login pela UI autentica contra a API: satisfied
  - EVD-003 [command]: scripts/smoke_streamlit_ui.py, stack real, exit 0
    - Artifact: artifacts/EVD-003-command.json
- smoke manual: UI lista documentos no escopo e permite upload, aprovacao e busca: satisfied
  - EVD-004 [command]: seletor exibe as obras do escopo por nome; criacao + upload
    do PDF em um unico submit gravou v1 na obra escolhida (hash conferido no MinIO);
    13 testes de UI verdes
    - Artifact: artifacts/EVD-004-command.json
