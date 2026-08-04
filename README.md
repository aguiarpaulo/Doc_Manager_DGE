# Doc_Manager_DGE

## Rodar a interface Streamlit

Com a API já no ar (`http://localhost:8000`):

```powershell
uv run streamlit run streamlit_app/app.py
```

A UI usa a variável `GED_API_URL` para achar a API (padrão: `http://localhost:8000`).

### Pré-requisito: obras cadastradas

O formulário "Novo documento" oferece um seletor com as obras que o usuário logado
pode acessar, buscadas em `GET /obras`. Só um **administrador** cria obras
(`POST /obras` exige o papel `administrador`), e `GET /obras` é filtrado pelo
escopo de quem chama — um usuário sem obra atribuída vê a lista vazia e a UI avisa
que é preciso pedir o cadastro a um administrador, em vez de oferecer um formulário
que a API vai recusar.

Cadastro das obras iniciais, autenticado como administrador:

```powershell
uv run python - <<'PY'
import requests
from streamlit_app import api_client

token = api_client.login("admin@exemplo.com.br", "SUA_SENHA")["access_token"]
for i in range(1, 6):
    requests.post(
        "http://localhost:8000/obras",
        headers={"Authorization": f"Bearer {token}"},
        json={"nome": f"Obra {i:02d}", "descricao": ""},
        timeout=30,
    ).raise_for_status()
PY
```

O e-mail do administrador precisa ter um domínio público válido: `email-validator`
rejeita nomes reservados como `.local`, e um usuário criado com esse domínio é aceito
no banco mas recusado com 422 no `POST /auth/login`.

---

## Verificação rápida (smoke tests)

Checagens manuais de que a infra está viva (rode com os serviços no ar):

```powershell
uv run python scripts/smoke_health.py              # a API responde? (/health)
uv run python scripts/smoke_minio_persistence.py   # o armazenamento funciona?
uv run python scripts/smoke_streamlit_ui.py        # a UI faz login, lista obras e sobe arquivo?
```

`smoke_streamlit_ui.py` executa `streamlit_app/app.py` no harness `AppTest` do
Streamlit **sem nenhum mock**, então cada chamada vai para a API, o PostgreSQL e o
MinIO reais. É o smoke exigido pelo contrato de validação do NODE-015; a suíte de
`pytest` sozinha não serve para isso, porque ela mocka o `api_client` e portanto
nunca exercita os tipos que a API valida de verdade.

Variáveis: `GED_SMOKE_EMAIL`, `GED_SMOKE_PASSWORD` e `GED_SMOKE_FILE` (caminho de um
PDF para anexar). Cada execução acrescenta bytes únicos ao arquivo enviado, porque a
API rejeita com 409 um upload cujo hash já exista na mesma obra.

---

## Erros da API na interface

Falhas de `GET /documents`, `GET /obras` e do envio de documentos são mostradas com
`st.error` usando a mensagem que a API devolveu, em vez de estourar traceback na tela.
`streamlit_app.api_client.error_message` normaliza os dois formatos que o FastAPI
produz: `detail` como texto (erros de negócio, ex.: 409 de hash duplicado) e `detail`
como lista de erros por campo (validação, 422).
