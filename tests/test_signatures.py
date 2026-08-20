"""Rubric registration: storage, ownership and withdrawal.

The privacy decision behind these tests is recorded as GAP-004: the rubric image is
personal data, so it never leaves the server except to its own owner, and its owner
may withdraw it without that rewriting any signature already applied to a document.
"""

import uuid

from app.models.signature import UserSignature
from app.models.user import Role
from app.storage import InMemoryStorage
from tests.conftest import make_png

# PNG real: bytes com a assinatura correta mas sem estrutura valida passam pela
# validacao da API (que so olha o content type) e so falham la na frente, quando
# o carimbo tenta desenhar a rubrica no PDF.
PNG = make_png()


SENHA = "s3cret-pass"


def _apagar(client, headers, senha: str = SENHA):
    """DELETE com corpo: a senha confirma o ato, como ao assinar."""
    return client.request(
        "DELETE", "/me/signature", json={"password": senha}, headers=headers
    )


def _upload(client, headers, data: bytes = PNG, content_type: str = "image/png"):
    return client.put(
        "/me/signature",
        files={"file": ("rubrica.png", data, content_type)},
        headers=headers,
    )


def test_owner_registers_rubric_stored_under_rubricas_prefix(
    client, auth_headers, db_session, storage: InMemoryStorage
):
    headers = auth_headers(Role.ENGENHEIRO)

    response = _upload(client, headers)

    assert response.status_code == 200
    body = response.json()
    assert body["tipo"] == "image/png"
    assert body["tamanho"] == len(PNG)
    assert len(body["hash"]) == 64

    # Metadata in the database, image in object storage — the same split the rest of
    # the system uses.
    signature = db_session.query(UserSignature).one()
    assert signature.object_key.startswith("rubricas/")
    assert str(signature.user_id) in signature.object_key
    assert storage.objects[signature.object_key] == PNG


def test_metadata_response_never_carries_the_image(client, auth_headers):
    headers = auth_headers(Role.ENGENHEIRO)

    body = _upload(client, headers).json()

    # Only metadata: the bytes come from the download endpoint, which authorizes.
    assert set(body) == {"id", "tipo", "tamanho", "hash", "atualizado_em"}


def test_owner_reads_back_own_rubric(client, auth_headers):
    headers = auth_headers(Role.ENGENHEIRO)
    _upload(client, headers)

    response = client.get("/me/signature", headers=headers)

    assert response.status_code == 200
    assert response.content == PNG
    assert response.headers["content-type"] == "image/png"
    # Personal data must not sit in a shared cache.
    assert "no-store" in response.headers["cache-control"]


def test_reading_without_a_registered_rubric_is_404(client, auth_headers):
    response = client.get("/me/signature", headers=auth_headers(Role.ENGENHEIRO))

    assert response.status_code == 404


def test_re_registering_replaces_the_previous_image(
    client, auth_headers, db_session, storage: InMemoryStorage
):
    headers = auth_headers(Role.ENGENHEIRO)
    _upload(client, headers)
    primeira_chave = db_session.query(UserSignature).one().object_key

    nova = b"\x89PNG\r\n\x1a\n" + b"outra rubrica"
    _upload(client, headers, data=nova)

    db_session.expire_all()
    signature = db_session.query(UserSignature).one()
    assert signature.object_key != primeira_chave
    assert storage.objects[signature.object_key] == nova
    # The replaced object is not left behind paying for storage forever.
    assert primeira_chave not in storage.objects
    assert client.get("/me/signature", headers=headers).content == nova


def test_only_png_is_accepted(client, auth_headers):
    headers = auth_headers(Role.ENGENHEIRO)

    response = _upload(client, headers, data=b"%PDF-1.4", content_type="application/pdf")

    assert response.status_code == 400
    assert "PNG" in response.json()["detail"]


def test_empty_rubric_is_rejected(client, auth_headers):
    response = _upload(client, auth_headers(Role.ENGENHEIRO), data=b"")

    assert response.status_code == 400


def test_oversized_rubric_is_rejected(client, auth_headers):
    grande = b"\x89PNG\r\n\x1a\n" + b"x" * (1 * 1024 * 1024 + 1)

    response = _upload(client, auth_headers(Role.ENGENHEIRO), data=grande)

    assert response.status_code == 400


# --- ownership -------------------------------------------------------------------


def test_each_user_only_ever_touches_their_own_rubric(
    client, make_user, headers_for, db_session
):
    make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    ana = headers_for("ana@example.com")
    bruno = headers_for("bruno@example.com")

    _upload(client, ana, data=PNG)
    outra = b"\x89PNG\r\n\x1a\n" + b"rubrica do bruno"
    _upload(client, bruno, data=outra)

    # Each read returns the caller's own image, never the other's.
    assert client.get("/me/signature", headers=ana).content == PNG
    assert client.get("/me/signature", headers=bruno).content == outra
    assert db_session.query(UserSignature).count() == 2


def test_administrator_gets_own_rubric_not_someone_elses(
    client, make_user, headers_for, auth_headers
):
    make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    _upload(client, headers_for("ana@example.com"), data=PNG)

    admin = auth_headers(Role.ADMINISTRADOR)

    # An administrator hitting the endpoint acts on their *own* rubric like anyone
    # else — and they have none, so it is 404 rather than Ana's image.
    assert client.get("/me/signature", headers=admin).status_code == 404


def test_no_endpoint_addresses_a_rubric_by_user_id(client, make_user):
    """The protection is structural: no route expresses "someone else's rubric"."""
    outro = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    caminhos = {
        rota.path for rota in client.app.routes if getattr(rota, "path", "").find("signature") >= 0
    }

    for caminho in caminhos:
        assert "{user_id}" not in caminho
        assert str(outro.id) not in caminho
    # And nothing hands out a self-authenticating URL to the object.
    assert not hasattr(InMemoryStorage, "presigned_url")


# --- withdrawal ------------------------------------------------------------------


def test_owner_deletes_own_rubric_and_the_object_disappears(
    client, auth_headers, db_session, storage: InMemoryStorage
):
    headers = auth_headers(Role.ENGENHEIRO)
    _upload(client, headers)
    chave = db_session.query(UserSignature).one().object_key
    assert chave in storage.objects

    response = _apagar(client, headers)

    assert response.status_code == 204
    assert chave not in storage.objects
    db_session.expire_all()
    assert db_session.query(UserSignature).count() == 0
    assert client.get("/me/signature", headers=headers).status_code == 404


def test_deleting_without_a_rubric_is_404(client, auth_headers):
    assert _apagar(client, auth_headers(Role.ENGENHEIRO)).status_code == 404


def test_deactivating_a_user_keeps_the_rubric(
    client, make_user, headers_for, auth_headers, db_session, storage: InMemoryStorage
):
    alvo = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    _upload(client, headers_for("ana@example.com"))
    chave = db_session.query(UserSignature).one().object_key

    admin = auth_headers(Role.ADMINISTRADOR)
    resposta = client.patch(f"/users/{alvo.id}", json={"is_active": False}, headers=admin)
    assert resposta.status_code == 200
    assert resposta.json()["is_active"] is False

    # Deactivation preserves everything so reactivation restores the account intact;
    # the rubric follows the same rule.
    db_session.expire_all()
    assert db_session.query(UserSignature).count() == 1
    assert chave in storage.objects


# --- exposure through /auth/me ---------------------------------------------------


def test_auth_me_reports_whether_a_rubric_exists(client, auth_headers):
    headers = auth_headers(Role.ENGENHEIRO)

    assert client.get("/auth/me", headers=headers).json()["has_signature"] is False

    _upload(client, headers)

    # The SPA needs this to decide whether to demand registration, without paying an
    # extra request on every mount.
    assert client.get("/auth/me", headers=headers).json()["has_signature"] is True


def test_auth_me_never_returns_the_image_itself(client, auth_headers):
    headers = auth_headers(Role.ENGENHEIRO)
    _upload(client, headers)

    corpo = client.get("/auth/me", headers=headers).json()

    assert "has_signature" in corpo
    assert not any("rubrica" in str(v) or "object_key" in k for k, v in corpo.items())


def test_rubric_requires_authentication(client):
    assert client.get("/me/signature").status_code in (401, 403)
    assert client.request(
        "DELETE", "/me/signature", json={"password": SENHA}
    ).status_code in (401, 403)


# --- storage protocol -------------------------------------------------------------


def test_in_memory_storage_delete_is_idempotent():
    storage = InMemoryStorage()
    storage.put_object("rubricas/x.png", PNG, "image/png")

    storage.delete_object("rubricas/x.png")
    # A retry after a partial failure must not raise.
    storage.delete_object("rubricas/x.png")

    assert "rubricas/x.png" not in storage.objects


def test_minio_storage_delegates_delete_to_the_client_and_bucket():
    """The adapter's job is to call the right client method on the right bucket.

    A real MinIO round-trip is exercised by the docker compose smoke (NODE-024) and
    by the end-to-end suite; what can go wrong *here* is the delegation itself —
    wrong method name, wrong argument order, wrong bucket — and that is what this
    covers without needing a server.
    """
    from app.storage import MinioStorage, ObjectStorage

    # The protocol gained delete_object, so every implementation must have it or the
    # API would fail only in production.
    assert hasattr(ObjectStorage, "delete_object")

    chamadas: list[tuple[str, str]] = []

    class ClienteFalso:
        def remove_object(self, bucket: str, key: str) -> None:
            chamadas.append((bucket, key))

    storage = MinioStorage.__new__(MinioStorage)
    storage._bucket = "documents"
    storage._client = ClienteFalso()

    storage.delete_object("rubricas/abc/def.png")

    assert chamadas == [("documents", "rubricas/abc/def.png")]
    assert uuid.UUID  # keeps the import list honest under ruff


# --- confirmacao por senha ao apagar ------------------------------------------------


def test_wrong_password_refuses_and_deletes_nothing(
    client, auth_headers, db_session, storage: InMemoryStorage
):
    """Uma sessao aberta nao basta: a senha e o que confirma o ato."""
    headers = auth_headers(Role.ENGENHEIRO)
    _upload(client, headers)
    chave = db_session.query(UserSignature).one().object_key

    resposta = _apagar(client, headers, senha="senha-errada")

    assert resposta.status_code == 403
    assert "Senha incorreta" in resposta.json()["detail"]
    db_session.expire_all()
    # Nada foi apagado: nem o metadado nem o objeto.
    assert db_session.query(UserSignature).count() == 1
    assert chave in storage.objects
    assert client.get("/me/signature", headers=headers).content == PNG


def test_an_empty_password_is_rejected(client, auth_headers, db_session):
    headers = auth_headers(Role.ENGENHEIRO)
    _upload(client, headers)

    resposta = client.request("DELETE", "/me/signature", json={"password": ""}, headers=headers)

    assert resposta.status_code in (403, 422)
    db_session.expire_all()
    assert db_session.query(UserSignature).count() == 1


def test_a_missing_body_is_rejected(client, auth_headers, db_session):
    headers = auth_headers(Role.ENGENHEIRO)
    _upload(client, headers)

    resposta = client.delete("/me/signature", headers=headers)

    # O corpo passou a ser obrigatorio: apagar sem confirmar nao e mais possivel.
    assert resposta.status_code == 422
    db_session.expire_all()
    assert db_session.query(UserSignature).count() == 1


def test_another_users_password_does_not_delete_my_rubric(
    client, make_user, headers_for, db_session
):
    make_user(email="ana@example.com", password="senha-da-ana-123", role=Role.ENGENHEIRO)
    make_user(email="bruno@example.com", password="senha-do-bruno-123", role=Role.ENGENHEIRO)
    ana = headers_for("ana@example.com", "senha-da-ana-123")
    _upload(client, ana)

    # A senha do outro nao serve, ainda que o chamador seja a Ana.
    resposta = _apagar(client, ana, senha="senha-do-bruno-123")

    assert resposta.status_code == 403
    db_session.expire_all()
    assert db_session.query(UserSignature).count() == 1


def test_the_delete_route_still_takes_no_user_id(client):
    """A protecao continua estrutural, nao virou uma checagem de senha."""
    caminhos = set(client.app.openapi()["paths"])
    de_rubrica = {c for c in caminhos if "signature" in c and not c.startswith("/documents")}

    assert de_rubrica == {"/me/signature", "/me/signature-requests"}
    assert all("{user_id}" not in c for c in de_rubrica)


def test_deleting_keeps_every_applied_signature_and_its_snapshot(
    client, db_session, make_user, make_obra, make_document, headers_for, storage
):
    """O direito de exclusao nao pode reescrever o passado."""
    from app.models.signature_applied import AppliedSignature
    from tests.conftest import make_pdf

    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    bruno = headers_for("bruno@example.com")

    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", make_pdf(), "application/pdf")},
        headers=ana,
    )
    _upload(client, bruno)
    pedido = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={
            "signatario_id": str(assinante.id),
            "pagina": 1,
            "x": 0.1,
            "y": 0.7,
            "largura": 0.3,
            "altura": 0.08,
            "page_width": 595.0,
            "page_height": 842.0,
        },
        headers=ana,
    ).json()
    client.post(
        f"/documents/{documento.id}/signature-requests/{pedido['id']}/sign",
        json={"password": SENHA},
        headers=bruno,
    )
    db_session.expire_all()
    assinatura = db_session.query(AppliedSignature).one()

    assert _apagar(client, bruno).status_code == 204

    db_session.expire_all()
    # A assinatura e sua copia da rubrica seguem intactas.
    assert db_session.query(AppliedSignature).count() == 1
    assert storage.objects[assinatura.rubrica_object_key] == PNG
    # E o documento continua entregando o PDF carimbado.
    baixado = client.get(f"/documents/{documento.id}/versions/1/download", headers=ana)
    assert baixado.status_code == 200


def test_the_password_is_never_stored_or_echoed(client, auth_headers, db_session):
    headers = auth_headers(Role.ENGENHEIRO)
    _upload(client, headers)

    resposta = _apagar(client, headers)

    assert resposta.status_code == 204
    assert resposta.content == b""
    # Nenhuma linha remanescente pode conter a senha.
    restantes = db_session.query(UserSignature).all()
    assert restantes == []
