"""The act of signing.

The test that matters most in this file is the snapshot one. The whole privacy
design from GAP-004 rests on a single claim: the owner of a rubric may change or
withdraw it, and a signature made earlier still shows the mark that was made. If the
signature merely pointed at the profile rubric, exercising the right to delete would
silently rewrite history.
"""

from app.models.document import DocumentStatus
from app.models.signature_applied import AppliedSignature
from app.models.signature_request import SignatureRequest, SignatureRequestStatus
from app.models.user import Role
from app.storage import InMemoryStorage
from tests.conftest import make_pdf

PDF = make_pdf(texto="contrato")
RUBRICA = b"\x89PNG\r\n\x1a\n" + b"assinatura da ana"
SENHA = "s3cret-pass"
AREA = {
    "pagina": 1,
    "x": 0.1,
    "y": 0.7,
    "largura": 0.3,
    "altura": 0.08,
    "page_width": 595.0,
    "page_height": 842.0,
}


def _preparar(client, make_user, make_obra, make_document, headers_for, storage=None):
    """Documento com PDF enviado, rubrica do signatário e uma solicitação pendente."""
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor, nome="Contrato principal")
    ana = headers_for("ana@example.com")
    bruno = headers_for("bruno@example.com")

    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("contrato.pdf", PDF, "application/pdf")},
        headers=ana,
    )
    client.put(
        "/me/signature",
        files={"file": ("rubrica.png", RUBRICA, "image/png")},
        headers=bruno,
    )
    pedido = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(assinante.id), **AREA},
        headers=ana,
    ).json()
    return autor, assinante, documento, ana, bruno, pedido


def _assinar(client, headers, documento_id, pedido_id, senha=SENHA):
    return client.post(
        f"/documents/{documento_id}/signature-requests/{pedido_id}/sign",
        json={"password": senha},
        headers=headers,
    )


# --- o ato --------------------------------------------------------------------------


def test_correct_password_records_signer_time_and_signed_version(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, assinante, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    resposta = _assinar(client, bruno, documento.id, pedido["id"])

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["signatario_id"] == str(assinante.id)
    assert corpo["signatario_nome"] == "bruno"
    assert corpo["assinado_em"]
    # The signature names the exact version that was signed.
    assert corpo["document_version_id"] == pedido["document_version_id"]

    db_session.expire_all()
    assert db_session.query(SignatureRequest).one().status is SignatureRequestStatus.ASSINADA


def test_wrong_password_refuses_and_leaves_the_request_pending(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    resposta = _assinar(client, bruno, documento.id, pedido["id"], senha="senha-errada")

    assert resposta.status_code == 403
    assert "Senha incorreta" in resposta.json()["detail"]
    db_session.expire_all()
    # Still signable: a typo must not consume the request.
    assert db_session.query(SignatureRequest).one().status is SignatureRequestStatus.PENDENTE
    assert db_session.query(AppliedSignature).count() == 0


def test_an_open_session_is_not_enough_without_the_password(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    # Authenticated, but sending an empty password: the session alone cannot sign.
    resposta = client.post(
        f"/documents/{documento.id}/signature-requests/{pedido['id']}/sign",
        json={"password": ""},
        headers=bruno,
    )

    assert resposta.status_code in (403, 422)


# --- o snapshot ---------------------------------------------------------------------


def test_the_rubric_is_copied_at_signing_time(
    client, db_session, make_user, make_obra, make_document, headers_for, storage
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    perfil_chave = [k for k in storage.objects if k.startswith("rubricas/")][0]

    _assinar(client, bruno, documento.id, pedido["id"])

    db_session.expire_all()
    assinatura = db_session.query(AppliedSignature).one()
    # A copy under its own prefix, not a pointer at the profile rubric.
    assert assinatura.rubrica_object_key.startswith("assinaturas/")
    assert assinatura.rubrica_object_key != perfil_chave
    assert storage.objects[assinatura.rubrica_object_key] == RUBRICA


def test_signature_survives_the_owner_deleting_their_profile_rubric(
    client, db_session, make_user, make_obra, make_document, headers_for, storage
):
    """The claim the whole GAP-004 design rests on."""
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    _assinar(client, bruno, documento.id, pedido["id"])
    db_session.expire_all()
    assinatura = db_session.query(AppliedSignature).one()

    # The owner withdraws their rubric — a right they have at any time.
    # Retirar a rubrica exige a senha do titular, como assinar (GAP-007).
    assert (
        client.request(
            "DELETE", "/me/signature", json={"password": SENHA}, headers=bruno
        ).status_code
        == 204
    )

    db_session.expire_all()
    # The signature is untouched and its image is still there.
    assert db_session.query(AppliedSignature).count() == 1
    assert storage.objects[assinatura.rubrica_object_key] == RUBRICA
    assert client.get("/me/signature", headers=bruno).status_code == 404


def test_signature_keeps_the_old_mark_after_the_rubric_is_replaced(
    client, db_session, make_user, make_obra, make_document, headers_for, storage
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    _assinar(client, bruno, documento.id, pedido["id"])
    db_session.expire_all()
    assinatura = db_session.query(AppliedSignature).one()

    nova = b"\x89PNG\r\n\x1a\n" + b"rubrica completamente diferente"
    client.put(
        "/me/signature", files={"file": ("r.png", nova, "image/png")}, headers=bruno
    )

    # The past signature still shows the mark that was actually made.
    assert storage.objects[assinatura.rubrica_object_key] == RUBRICA
    assert client.get("/me/signature", headers=bruno).content == nova


def test_signing_without_a_registered_rubric_is_refused(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("contrato.pdf", PDF, "application/pdf")},
        headers=ana,
    )
    pedido = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(assinante.id), **AREA},
        headers=ana,
    ).json()

    # Bruno never registered a rubric: there is nothing to snapshot.
    resposta = _assinar(client, headers_for("bruno@example.com"), documento.id, pedido["id"])

    assert resposta.status_code == 409
    assert "rubrica" in resposta.json()["detail"].lower()


# --- quem pode assinar ---------------------------------------------------------------


def test_only_the_named_signatory_can_sign(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, ana, _, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    # The requester is not the signatory.
    resposta = _assinar(client, ana, documento.id, pedido["id"])

    assert resposta.status_code == 403
    assert "signatário indicado" in resposta.json()["detail"]


def test_an_administrator_cannot_sign_for_someone_else(
    client, make_user, make_obra, make_document, headers_for, make_obra_noop=None
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    admin = make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    obra = make_obra(users=[autor, assinante, admin])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("contrato.pdf", PDF, "application/pdf")},
        headers=ana,
    )
    client.put(
        "/me/signature",
        files={"file": ("r.png", RUBRICA, "image/png")},
        headers=headers_for("bruno@example.com"),
    )
    pedido = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(assinante.id), **AREA},
        headers=ana,
    ).json()

    # A signature is personal: no role can produce someone else's.
    resposta = _assinar(client, headers_for("admin@example.com"), documento.id, pedido["id"])

    assert resposta.status_code == 403


def test_signing_twice_is_rejected(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    assert _assinar(client, bruno, documento.id, pedido["id"]).status_code == 201
    segunda = _assinar(client, bruno, documento.id, pedido["id"])

    assert segunda.status_code == 409
    assert "assinada" in segunda.json()["detail"]
    db_session.expire_all()
    assert db_session.query(AppliedSignature).count() == 1


def test_a_request_from_another_document_is_not_found(
    client, make_user, make_obra, make_document, headers_for
):
    autor, assinante, documento, ana, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    outro = make_document(
        make_obra(nome="Outra obra", users=[autor, assinante]), autor, nome="Outro"
    )

    # The request id is real, but it does not belong to this document.
    resposta = _assinar(client, bruno, outro.id, pedido["id"])

    assert resposta.status_code == 404


# --- o que assinar NAO faz -----------------------------------------------------------


def test_signing_does_not_touch_the_approval_status_or_create_a_version(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    from app.models.document import Document
    from app.models.document_version import DocumentVersion

    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    db_session.expire_all()
    versoes_antes = db_session.query(DocumentVersion).count()

    _assinar(client, bruno, documento.id, pedido["id"])

    db_session.expire_all()
    atual = db_session.get(Document, documento.id)
    # Signing and approval answer different questions; a signature must not move a
    # document through the approval state machine.
    assert atual.status is DocumentStatus.ENVIADO
    assert atual.current_version == 1
    assert db_session.query(DocumentVersion).count() == versoes_antes


def test_the_signature_is_recorded_in_the_audit_trail(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    from app.models.audit import AuditAction, AuditLog

    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    _assinar(client, bruno, documento.id, pedido["id"])

    db_session.expire_all()
    acoes = [log.action for log in db_session.query(AuditLog).all()]
    assert AuditAction.SIGNED.value in acoes


def test_signatures_are_listed_for_the_document(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, ana, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    _assinar(client, bruno, documento.id, pedido["id"])

    lista = client.get(f"/documents/{documento.id}/signatures", headers=ana)

    assert lista.status_code == 200
    assert len(lista.json()) == 1
    assert lista.json()[0]["signatario_nome"] == "bruno"


def test_the_password_never_appears_in_the_stored_signature(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    _assinar(client, bruno, documento.id, pedido["id"])

    db_session.expire_all()
    assinatura = db_session.query(AppliedSignature).one()
    valores = " ".join(str(getattr(assinatura, c.name)) for c in assinatura.__table__.columns)
    assert SENHA not in valores


def test_storage_holds_both_the_profile_rubric_and_the_snapshot(
    client, db_session, make_user, make_obra, make_document, headers_for, storage: InMemoryStorage
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    _assinar(client, bruno, documento.id, pedido["id"])

    perfil = [k for k in storage.objects if k.startswith("rubricas/")]
    snapshot = [k for k in storage.objects if k.startswith("assinaturas/")]
    # Two independent objects: that independence is the whole point.
    assert len(perfil) == 1
    assert len(snapshot) == 1
