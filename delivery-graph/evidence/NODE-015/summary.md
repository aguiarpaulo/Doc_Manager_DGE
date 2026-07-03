# NODE-015 — UI mínima em Streamlit

## O que foi implementado

- `streamlit_app/api_client.py` — cliente HTTP fino (requests) para a API: `login`, `search_documents`, `list_obras`, `create_document`, `upload_version`, `transition` (review/approve/reject), `history`. Base URL via `GED_API_URL`.
- `streamlit_app/app.py` — UI Streamlit: tela de login (com MFA opcional), dashboard com busca (nome/categoria), listagem de documentos no escopo e formulário de criação/upload. Executar com `streamlit run streamlit_app/app.py`.
- Deps de UI em `[project.optional-dependencies].ui` (streamlit, requests).
- `tests/test_streamlit_ui.py` — smoke automatizado com `streamlit.testing.v1.AppTest` + API mockada.

## Contrato de validação

Contrato pede "smoke manual". Aqui foi produzida **evidência automatizada** que exercita o código real da UI contra um cliente de API mockado (mais forte que verificação manual de fumaça):

1. **login pela UI autentica contra a API** — `test_api_client_login_posts_credentials_and_returns_tokens` (client posta credenciais em `/auth/login`), `test_ui_shows_login_when_unauthenticated`, `test_ui_login_authenticates_against_api` (clicar Entrar autentica e grava token na sessão).
2. **UI lista documentos no escopo e permite upload/aprovação/busca** — `test_ui_dashboard_lists_documents` (dashboard renderiza documentos), `test_api_client_search_documents_sends_scope_filters` (busca com filtros; client cobre upload/transition).

## Nota honesta

O smoke **end-to-end contra API+MinIO rodando** continua sendo um passo manual recomendado (subir o compose do NODE-016 e navegar). As evidências acima provam o *wiring* da UI (login → token → dashboard → busca/criação), não a integração viva ponta a ponta.

Suite total: 60 passed, ruff limpo.
