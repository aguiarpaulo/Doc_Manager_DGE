# NODE-015 Evidence

Node: UI minima em Streamlit (login, listar/filtrar, upload, aprovar/rejeitar, historico)

## Items

- EVD-001 [command] satisfies `smoke manual: login pela UI autentica contra a API`: .venv/Scripts/pytest.exe tests/test_streamlit_ui.py -k login or shows_login -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `smoke manual: UI lista documentos no escopo e permite upload, aprovacao e busca`: .venv/Scripts/pytest.exe tests/test_streamlit_ui.py -k dashboard_lists or search_documents -q passed
  - Artifact: artifacts/EVD-002-command.json
