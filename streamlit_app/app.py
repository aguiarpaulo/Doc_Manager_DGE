"""Minimal Streamlit UI for the GED DGE system.

Talks to the FastAPI backend through `api_client`. Run with:
    streamlit run streamlit_app/app.py
"""

import requests
import streamlit as st

from streamlit_app import api_client

st.set_page_config(page_title="GED DGE", page_icon="📄")
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


def render_dashboard() -> None:
    token = st.session_state.token
    st.success("Autenticado")
    if st.button("Sair", key="logout_btn"):
        st.session_state.token = None
        st.rerun()

    st.subheader("Buscar documentos")
    nome = st.text_input("Nome contém", key="search_nome")
    categoria = st.selectbox(
        "Categoria",
        ["", "contrato", "projeto", "nota_fiscal", "licenca", "laudo", "outros"],
        key="search_categoria",
    )
    try:
        documents = api_client.search_documents(token, nome=nome, categoria=categoria)
    except requests.HTTPError as exc:
        st.error(api_client.error_message(exc))
        documents = []
    st.caption(f"{len(documents)} documento(s)")
    for doc in documents:
        st.write(f"**{doc['nome']}** — {doc['categoria']} — status: {doc['status']}")

    st.subheader("Novo documento")
    try:
        obras = api_client.list_obras(token)
    except requests.HTTPError as exc:
        st.error(api_client.error_message(exc))
        return

    if not obras:
        st.warning("Nenhuma obra cadastrada. Peça a um administrador para cadastrar uma obra.")
        return

    nome_por_id = {obra["id"]: obra["nome"] for obra in obras}
    with st.form("new_doc"):
        new_nome = st.text_input("Nome do documento", key="new_nome")
        new_obra = st.selectbox(
            "Obra",
            list(nome_por_id),
            format_func=lambda obra_id: nome_por_id[obra_id],
            key="new_obra",
        )
        new_cat = st.selectbox(
            "Categoria",
            ["contrato", "projeto", "nota_fiscal", "licenca", "laudo", "outros"],
            key="new_categoria",
        )
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


if st.session_state.token:
    render_dashboard()
else:
    render_login()
