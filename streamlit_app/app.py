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
PAPEIS = ["administrador", "diretor", "engenheiro", "financeiro"]
ADMIN_ROLE = "administrador"
REGRA_USUARIO = (
    "3 a 32 caracteres, sem espaços. Letras, números, ponto, hífen e sublinhado. "
    "Exemplo: pauloaguiar"
)
# Mirrors ALLOWED_CONTENT_TYPES in app/services/uploads.py; the API is the real gate.
EXTENSOES = ["pdf", "png", "jpg", "jpeg", "txt", "doc", "docx", "xls", "xlsx"]

# Status colours carry a label too: colour alone is not an accessible signal.
STATUS_APRESENTACAO = {
    "enviado": ("gray", "Enviado"),
    "em_analise": ("orange", "Em análise"),
    "aprovado": ("green", "Aprovado"),
    "rejeitado": ("red", "Rejeitado"),
}

st.set_page_config(page_title="GED DGE", page_icon="📄", layout="wide")
st.title("GED DGE")
st.caption("Gestão Eletrônica de Documentos de Obras")
st.divider()

if "token" not in st.session_state:
    st.session_state.token = None


def status_badge(status: str) -> str:
    cor, rotulo = STATUS_APRESENTACAO.get(status, ("gray", status))
    return f":{cor}-background[**{rotulo}**]"


def render_login() -> None:
    # A login form stretched across a wide layout looks unfinished; hold it to a column.
    _, meio, _ = st.columns([1, 1.4, 1])
    with meio:
        st.subheader("Entrar")
        username = st.text_input("Usuário", key="username", placeholder="pauloaguiar")
        password = st.text_input("Senha", type="password", key="password")
        mfa = st.text_input("Código MFA (se ativo)", key="mfa")
        if st.button("Entrar", key="login_btn", type="primary", width="stretch"):
            try:
                tokens = api_client.login(username, password, mfa or None)
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
        uploaded = st.file_uploader(
            "Arquivo (PDF, imagem, Word, Excel ou TXT)", type=EXTENSOES, key="new_file"
        )
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
    st.markdown(status_badge(document["status"]))
    st.caption(
        f"{document['categoria']} · versão {document['current_version']} "
        f"· incluído em {document['criado_em']}"
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


def _user_label(user: dict) -> str:
    sufixo = "" if user.get("is_active", True) else " — inativo"
    return f"{user['email']} ({user['role']}){sufixo}"


def render_admin_tab(token: str, nome_por_id: dict[str, str]) -> None:
    st.subheader("Nova obra")
    with st.form("admin_obra"):
        nome = st.text_input("Nome da obra", key="admin_obra_nome")
        descricao = st.text_input("Descrição (opcional)", key="admin_obra_descricao")
        if st.form_submit_button("Cadastrar obra") and nome:
            try:
                api_client.create_obra(token, nome, descricao)
            except requests.HTTPError as exc:
                st.error(api_client.error_message(exc))
            else:
                st.success(f"Obra cadastrada: {nome}.")

    st.subheader("Novo usuário")
    with st.form("admin_user"):
        usuario = st.text_input("Usuário (sem espaços)", key="admin_user_nome")
        st.caption(REGRA_USUARIO)
        email = st.text_input("E-mail", key="admin_user_email")
        senha = st.text_input("Senha", type="password", key="admin_user_senha")
        senha2 = st.text_input("Confirmar senha", type="password", key="admin_user_senha2")
        papel = st.selectbox("Papel", PAPEIS, key="admin_user_role")
        if st.form_submit_button("Cadastrar usuário") and usuario and email and senha:
            if senha != senha2:
                st.error("As senhas não conferem. Digite a mesma senha nos dois campos.")
            else:
                try:
                    api_client.create_user(token, usuario, email, senha, papel)
                except requests.HTTPError as exc:
                    st.error(api_client.error_message(exc))
                else:
                    st.success(f"Usuário {usuario} cadastrado.")

    try:
        users = api_client.list_users(token)
    except requests.HTTPError as exc:
        st.error(api_client.error_message(exc))
        return

    por_id = {user["id"]: user for user in users}
    email_por_id = {uid: _user_label(user) for uid, user in por_id.items()}

    # User management first: none of it depends on an obra existing.
    if users:
        st.subheader("Alterar papel do usuário")
        with st.form("admin_role"):
            role_user_id = st.selectbox(
                "Usuário",
                list(email_por_id),
                format_func=lambda uid: email_por_id[uid],
                key="admin_role_user",
            )
            novo_papel = st.selectbox("Novo papel", PAPEIS, key="admin_role_value")
            if st.form_submit_button("Alterar papel"):
                try:
                    api_client.update_user(token, role_user_id, role=novo_papel)
                except requests.HTTPError as exc:
                    st.error(api_client.error_message(exc))
                else:
                    st.success(f"{email_por_id[role_user_id]} agora é {novo_papel}.")

        st.subheader("Ativar ou desativar usuário")
        st.caption(
            "Desativar tira o acesso ao sistema na hora, mas preserva a autoria dos "
            "documentos, a trilha de auditoria e os vínculos com obras — reativar devolve tudo."
        )
        # Outside a form on purpose: the button label follows the selected user's state.
        status_user_id = st.selectbox(
            "Usuário",
            list(email_por_id),
            format_func=lambda uid: email_por_id[uid],
            key="admin_status_user",
        )
        esta_ativo = por_id[status_user_id].get("is_active", True)
        if st.button(
            "Desativar usuário" if esta_ativo else "Reativar usuário", key="admin_status_btn"
        ):
            try:
                api_client.update_user(token, status_user_id, is_active=not esta_ativo)
            except requests.HTTPError as exc:
                st.error(api_client.error_message(exc))
            else:
                acao = "desativado" if esta_ativo else "reativado"
                st.success(f"{email_por_id[status_user_id]} {acao}.")

    st.subheader("Restaurar obra arquivada")
    try:
        arquivadas = api_client.list_archived_obras(token)
    except requests.HTTPError as exc:
        st.error(api_client.error_message(exc))
        arquivadas = []
    if arquivadas:
        arquivada_por_id = {obra["id"]: obra["nome"] for obra in arquivadas}
        with st.form("admin_restore"):
            restore_id = st.selectbox(
                "Obra arquivada",
                list(arquivada_por_id),
                format_func=lambda oid: arquivada_por_id[oid],
                key="admin_restore_obra",
            )
            if st.form_submit_button("Restaurar obra"):
                try:
                    api_client.restore_obra(token, restore_id)
                except requests.HTTPError as exc:
                    st.error(api_client.error_message(exc))
                else:
                    st.success(f"Obra {arquivada_por_id[restore_id]} restaurada.")
    else:
        st.caption("Nenhuma obra arquivada.")

    if not nome_por_id:
        st.info("Cadastre uma obra para conceder acessos ou arquivar.")
        return
    if not users:
        st.info("Nenhum usuário cadastrado ainda.")
        return

    st.subheader("Conceder acesso a uma obra")
    st.caption(
        "Administrador e diretor já enxergam todas as obras; a atribuição só muda o que "
        "engenheiro e financeiro conseguem ver."
    )
    with st.form("admin_grant"):
        obra_id = st.selectbox(
            "Obra",
            list(nome_por_id),
            format_func=lambda oid: nome_por_id[oid],
            key="admin_grant_obra",
        )
        user_id = st.selectbox(
            "Usuário",
            list(email_por_id),
            format_func=lambda uid: email_por_id[uid],
            key="admin_grant_user",
        )
        if st.form_submit_button("Conceder acesso"):
            try:
                api_client.grant_obra_access(token, obra_id, user_id)
            except requests.HTTPError as exc:
                st.error(api_client.error_message(exc))
            else:
                st.success(f"{email_por_id[user_id]} agora acessa {nome_por_id[obra_id]}.")

    st.subheader("Revogar acesso a uma obra")
    with st.form("admin_revoke"):
        revoke_obra_id = st.selectbox(
            "Obra",
            list(nome_por_id),
            format_func=lambda oid: nome_por_id[oid],
            key="admin_revoke_obra",
        )
        revoke_user_id = st.selectbox(
            "Usuário",
            list(email_por_id),
            format_func=lambda uid: email_por_id[uid],
            key="admin_revoke_user",
        )
        if st.form_submit_button("Revogar acesso"):
            try:
                api_client.revoke_obra_access(token, revoke_obra_id, revoke_user_id)
            except requests.HTTPError as exc:
                st.error(api_client.error_message(exc))
            else:
                st.success(
                    f"{email_por_id[revoke_user_id]} não acessa mais {nome_por_id[revoke_obra_id]}."
                )

    st.subheader("Arquivar obra")
    st.caption(
        "A obra sai das listagens e deixa de aceitar documentos novos. Nada é apagado: "
        "documentos, arquivos e vínculos continuam lá e voltam se a obra for restaurada."
    )
    with st.form("admin_archive"):
        archive_id = st.selectbox(
            "Obra",
            list(nome_por_id),
            format_func=lambda oid: nome_por_id[oid],
            key="admin_archive_obra",
        )
        if st.form_submit_button("Arquivar obra"):
            try:
                api_client.archive_obra(token, archive_id)
            except requests.HTTPError as exc:
                st.error(api_client.error_message(exc))
            else:
                st.success(f"Obra {nome_por_id[archive_id]} arquivada.")


def render_identity_bar(current_user: dict | None) -> None:
    identidade, sair = st.columns([5, 1])
    with identidade:
        if current_user:
            st.caption(f"**{current_user['username']}** · {current_user['role']}")
    with sair:
        if st.button("Sair", key="logout_btn", width="stretch"):
            st.session_state.token = None
            st.rerun()


def render_dashboard() -> None:
    token = st.session_state.token

    try:
        current_user = api_client.me(token)
        obras = api_client.list_obras(token)
    except requests.HTTPError as exc:
        # Still offer the way out: a stale token must not trap the user on this screen.
        render_identity_bar(None)
        st.error(api_client.error_message(exc))
        return

    render_identity_bar(current_user)

    is_admin = current_user.get("role") == ADMIN_ROLE
    nome_por_id = {obra["id"]: obra["nome"] for obra in obras}

    labels = ["Enviar documento", "Documentos"]
    if is_admin:
        labels.append("Administração")
    tabs = st.tabs(labels)

    sem_obra = "Nenhuma obra cadastrada. Peça a um administrador para cadastrar uma obra."
    with tabs[0]:
        if obras:
            render_upload_tab(token, nome_por_id)
        else:
            st.warning(sem_obra)
    with tabs[1]:
        if obras:
            render_documents_tab(token, nome_por_id)
        else:
            st.warning(sem_obra)
    if is_admin:
        # Reachable with zero obras on purpose: this tab is where the first one is created.
        with tabs[2]:
            render_admin_tab(token, nome_por_id)


if st.session_state.token:
    render_dashboard()
else:
    render_login()
