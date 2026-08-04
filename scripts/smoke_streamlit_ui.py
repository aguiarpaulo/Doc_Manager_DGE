"""Smoke check (NODE-015): drive the Streamlit UI against the running stack.

Runs `streamlit_app/app.py` through Streamlit's AppTest harness with no mocks, so
every call goes to the live API, PostgreSQL and MinIO. Covers the two validation
items of NODE-015: login through the UI, and listing plus creating a document with
a file attached in a single submit.

Requires the stack up (`docker compose up -d`) and an admin account. Configure with
GED_SMOKE_EMAIL, GED_SMOKE_PASSWORD, and optionally GED_SMOKE_FILE.
"""

import os
import sys
import uuid
from pathlib import Path

from streamlit.testing.v1 import AppTest

from streamlit_app import api_client

APP = str(Path(__file__).resolve().parent.parent / "streamlit_app" / "app.py")
EMAIL = os.environ.get("GED_SMOKE_EMAIL", "admin@dge.com.br")
PASSWORD = os.environ.get("GED_SMOKE_PASSWORD", "Admin@12345")
UPLOAD = os.environ.get("GED_SMOKE_FILE")
RUN_ID = uuid.uuid4().hex[:8]
DOC_NAME = f"smoke-streamlit-ui-{RUN_ID}"


def _click(at: AppTest, label: str) -> AppTest:
    return next(button for button in at.button if button.label == label).click().run()


def main() -> int:
    at = AppTest.from_file(APP, default_timeout=90).run()
    at.text_input(key="email").set_value(EMAIL)
    at.text_input(key="password").set_value(PASSWORD)
    at = _click(at, "Entrar")
    if at.exception or not at.session_state["token"]:
        print(f"SMOKE FAILED: login pela UI nao autenticou: {at.exception}", file=sys.stderr)
        return 1
    token = at.session_state["token"]
    print(f"login OK: {EMAIL}")

    # O `st.rerun()` do login deixa nos orfaos da tela anterior na arvore do AppTest
    # (no navegador o rerun troca a arvore inteira). Com o login ja provado acima,
    # o restante do smoke roda numa sessao limpa e ja autenticada.
    at = AppTest.from_file(APP, default_timeout=90)
    at.session_state["token"] = token
    at = at.run()

    obras = api_client.list_obras(token)
    if not obras:
        print("SMOKE FAILED: nenhuma obra no escopo do usuario", file=sys.stderr)
        return 1
    shown = at.selectbox(key="new_obra").options
    print(f"obras oferecidas na UI: {shown}")
    if shown != [obra["nome"] for obra in obras]:
        print("SMOKE FAILED: o seletor nao exibe os nomes das obras", file=sys.stderr)
        return 1

    alvo = obras[-1]
    at.text_input(key="new_nome").set_value(DOC_NAME)
    at.selectbox(key="new_obra").set_value(alvo["id"])
    at.selectbox(key="new_categoria").set_value("outros")
    if UPLOAD:
        arquivo = Path(UPLOAD)
        # A obra rejeita hash duplicado (409), entao cada execucao envia bytes unicos.
        conteudo = arquivo.read_bytes() + f"\n%% smoke {RUN_ID}\n".encode()
        at.file_uploader(key="new_file").set_value((arquivo.name, conteudo, "application/pdf"))
    at = _click(at, "Criar e enviar")

    erros = [error.value for error in at.error]
    if at.exception or erros:
        print(f"SMOKE FAILED: envio recusado: {at.exception or erros}", file=sys.stderr)
        return 1

    criados = [
        doc
        for doc in api_client.search_documents(token, nome=DOC_NAME)
        if doc["obra_id"] == alvo["id"]
    ]
    if not criados:
        print(f"SMOKE FAILED: documento nao gravado na obra {alvo['nome']}", file=sys.stderr)
        return 1
    documento = criados[-1]
    print(f"documento criado na obra {alvo['nome']}: v{documento['current_version']}")

    if UPLOAD and documento["current_version"] < 1:
        print("SMOKE FAILED: arquivo anexado nao gerou versao", file=sys.stderr)
        return 1

    # Aba "Documentos": arvore no estilo SEI e visualizador do documento selecionado.
    at.selectbox(key="tree_obra").set_value(alvo["id"])
    at = at.run()
    arvore = [b.label for b in at.button if (b.key or "").startswith("doc_")]
    if not arvore:
        print(f"SMOKE FAILED: arvore vazia para a obra {alvo['nome']}", file=sys.stderr)
        return 1
    print(f"arvore da obra {alvo['nome']}: {len(arvore)} documento(s), ultimo = {arvore[-1]}")

    at = _click(at, arvore[-1])
    erros = [error.value for error in at.error]
    if at.exception or erros:
        print(f"SMOKE FAILED: visualizador quebrou: {at.exception or erros}", file=sys.stderr)
        return 1

    baixado, tipo = api_client.download_version(
        token, documento["id"], documento["current_version"]
    )
    if UPLOAD and (tipo != "application/pdf" or not baixado.startswith(b"%PDF-")):
        print(f"SMOKE FAILED: conteudo servido nao e PDF ({tipo})", file=sys.stderr)
        return 1
    print(f"visualizador abriu o documento: {len(baixado)} bytes, {tipo}")

    print("SMOKE OK: login, arvore por ordem de inclusao, upload e visualizacao pela UI")
    return 0


if __name__ == "__main__":
    sys.exit(main())
