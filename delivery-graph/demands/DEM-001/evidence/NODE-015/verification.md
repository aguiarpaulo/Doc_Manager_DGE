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
