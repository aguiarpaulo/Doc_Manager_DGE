"""Minimal Streamlit UI for the GED DGE system.

Talks to the FastAPI backend through `api_client`. Run with:
    streamlit run streamlit_app/app.py

The consultation tab follows the SEI (Sistema Eletrônico de Informações) layout: an
obra plays the role of a process, its documents are listed vertically in inclusion
order, and the selected one has its content rendered beside the list.
"""

import requests
import streamlit as st
from streamlit.errors import StreamlitAPIException

from streamlit_app import api_client

CATEGORIAS = ["contrato", "projeto", "nota_fiscal", "licenca", "laudo", "outros"]

st.set_page_config(page_title="GED DGE", page_icon="📄", layout="wide")
st.title("📄 GED DGE — Gestão de Documentos")

if "token" not in st.session_state:
    st.session_state.token = None


def render_login() -> None:
    st.subheader("Entrar")
    email = st.text_input("E-mail", key="email")
    password = st.text_input("Senha", type="password", key="password")
    mfa = st.text_input("Código MFA (se ativo)", key="mfa")
    if st.button("Entrar", key="login_btn"):
        try:
            tokens = api_client.login(email, password, mfa or None)
            st.session_state.token = tokens["access_token"]
            st.rerun()
        except Exception:
            st.error("Falha no login. Verifique as credenciais.")


@st.cache_data(show_spinner=False)
def _content_of(token: str, document_id: str, version: int) -> tuple[bytes, str]:
    """Cached so navigating the tree does not refetch the same file on every rerun."""
    return api_client.download_version(token, document_id, version)


def render_upload_tab(token: str, nome_por_id: dict[str, str]) -> None:
    with st.form("new_doc"):
        new_nome = st.text_input("Nome do documento", key="new_nome")
        new_obra = st.selectbox(
            "Obra",
            list(nome_por_id),
            format_func=lambda obra_id: nome_por_id[obra_id],
            key="new_obra",
        )
        new_cat = st.selectbox("Categoria", CATEGORIAS, key="new_categoria")
        uploaded = st.file_uploader("Arquivo (PDF/PNG/JPG)", key="new_file")
        if st.form_submit_button("Criar e enviar") and new_nome:
            try:
                doc = api_client.create_document(token, new_nome, new_obra, new_cat)
                if uploaded is not None:
                    api_client.upload_version(
                        token, doc["id"], uploaded.name, uploaded.getvalue(), uploaded.type
                    )
            except requests.HTTPError as exc:
                st.error(api_client.error_message(exc))
            else:
                st.success(f"Documento {doc['nome']} criado.")


def render_content(content: bytes, content_type: str) -> None:
    if content_type.startswith("application/pdf"):
        try:
            st.pdf(content, height=700)
        except StreamlitAPIException:
            # The PDF viewer ships in the `streamlit[pdf]` extra; without it the page
            # would die, so say what is missing and leave the download button working.
            st.info("Visualizador de PDF indisponível: instale o extra `streamlit[pdf]`.")
    elif content_type.startswith("image/"):
        st.image(content)
    else:
        st.caption(f"Sem prévia para {content_type}. Use o botão acima para baixar.")


def render_viewer(token: str, document: dict | None) -> None:
    if document is None:
        st.info("Selecione um documento na lista ao lado para ver o conteúdo.")
        return

    st.markdown(f"#### {document['nome']}")
    st.caption(
        f"{document['categoria']} · status: {document['status']} "
        f"· versão {document['current_version']} · incluído em {document['criado_em']}"
    )
    if document["current_version"] < 1:
        st.warning("Este documento ainda não tem arquivo enviado.")
        return

    try:
        content, content_type = _content_of(token, document["id"], document["current_version"])
    except requests.HTTPError as exc:
        st.error(api_client.error_message(exc))
        return

    st.download_button(
        "Baixar",
        content,
        file_name=document["nome"],
        mime=content_type,
        key=f"download_{document['id']}",
    )
    render_content(content, content_type)


def render_documents_tab(token: str, nome_por_id: dict[str, str]) -> None:
    obra_id = st.selectbox(
        "Obra",
        list(nome_por_id),
        format_func=lambda oid: nome_por_id[oid],
        key="tree_obra",
    )
    try:
        documents = api_client.search_documents(token, obra_id=obra_id)
    except requests.HTTPError as exc:
        st.error(api_client.error_message(exc))
        return

    # SEI orders the process tree by inclusion: oldest at the top, newest at the bottom.
    documents = sorted(documents, key=lambda doc: doc["criado_em"])
    if not documents:
        st.info("Nenhum documento nesta obra.")
        return

    tree, viewer = st.columns([1, 2])
    with tree:
        st.caption(f"{len(documents)} documento(s)")
        for position, doc in enumerate(documents, start=1):
            is_open = doc["id"] == st.session_state.get("open_document")
            if st.button(
                f"{position}. {doc['nome']}",
                key=f"doc_{doc['id']}",
                type="primary" if is_open else "secondary",
                width="stretch",
            ):
                st.session_state.open_document = doc["id"]

    # A selection made in another obra must not leak into this one.
    open_id = st.session_state.get("open_document")
    open_document = next((doc for doc in documents if doc["id"] == open_id), None)
    with viewer:
        render_viewer(token, open_document)


def render_dashboard() -> None:
    token = st.session_state.token
    if st.button("Sair", key="logout_btn"):
        st.session_state.token = None
        st.rerun()

    try:
        obras = api_client.list_obras(token)
    except requests.HTTPError as exc:
        st.error(api_client.error_message(exc))
        return

    if not obras:
        st.warning("Nenhuma obra cadastrada. Peça a um administrador para cadastrar uma obra.")
        return

    nome_por_id = {obra["id"]: obra["nome"] for obra in obras}
    upload_tab, documents_tab = st.tabs(["Enviar documento", "Documentos"])
    with upload_tab:
        render_upload_tab(token, nome_por_id)
    with documents_tab:
        render_documents_tab(token, nome_por_id)


if st.session_state.token:
    render_dashboard()
else:
    render_login()
