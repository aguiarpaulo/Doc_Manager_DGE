# NODE-015 Evidence

Node: UI minima em Streamlit (login, listar/filtrar, upload, aprovar/rejeitar, historico)

## Items

- EVD-001 [command] satisfies `smoke manual: login pela UI autentica contra a API`: .venv/Scripts/pytest.exe tests/test_streamlit_ui.py -k login or shows_login -q passed
  - Artifact: artifacts/EVD-001-command.json
- EVD-002 [command] satisfies `smoke manual: UI lista documentos no escopo e permite upload, aprovacao e busca`: .venv/Scripts/pytest.exe tests/test_streamlit_ui.py -k dashboard_lists or search_documents -q passed
  - Artifact: artifacts/EVD-002-command.json
- EVD-003 [command] satisfies `smoke manual: login pela UI autentica contra a API`: scripts/smoke_streamlit_ui.py dirigiu app.py contra API+PostgreSQL+MinIO reais (sem mocks): login pela UI autenticou
  - Artifact: artifacts/EVD-003-command.json
- EVD-004 [command] satisfies `smoke manual: UI lista documentos no escopo e permite upload, aprovacao e busca`: smoke real: seletor lista as obras do escopo por nome, criacao + upload do PDF em um unico submit gravou v1 na obra escolhida; 13 testes de UI cobrem selecao de obra e erros da API
  - Artifact: artifacts/EVD-004-command.json

## Nota sobre EVD-001/EVD-002

EVD-001 e EVD-002 sao execucoes de pytest com o `api_client` mockado. Eles nao
satisfazem o "smoke manual" exigido pelo contrato de validacao: por rodarem sem a
API real, nunca exercitaram o `obra_id` tipado como `uuid.UUID`, e o formulario
"Novo documento" foi para producao pedindo esse UUID em um campo de texto livre —
qualquer valor digitado retornava 422. EVD-003 e EVD-004 registram o smoke contra
o stack real, que e o que o contrato pede.
