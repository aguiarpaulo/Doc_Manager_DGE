"""A new version invalidates areas marked on the previous one.

This closes the gap left open by NODE-029. Coordinates were drawn against a specific
pagination; a new upload may repaginate the file, so honouring an older request would
put a rubric somewhere nobody pointed at, on a page the signatory never saw.

Signatures already applied are a different matter and must survive untouched: they
attest to the version they were made on, and that version still exists.
"""

from app.models.audit import AuditAction, AuditLog
from app.models.document import Document, DocumentStatus
from app.models.signature_applied import AppliedSignature
from app.models.signature_request import SignatureRequest, SignatureRequestStatus
from app.models.user import Role
from tests.conftest import make_pdf

PDF_V1 = make_pdf(texto="versao um")
PDF_V2 = make_pdf(paginas=2, texto="versao dois")
RUBRICA = b"\x89PNG\r\n\x1a\n" + b"rubrica"
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


def _cenario(client, make_user, make_obra, make_document, headers_for, n_assinantes=2):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    nomes = ["bruno", "carla", "diego"][:n_assinantes]
    assinantes = [
        make_user(email=f"{n}@example.com", role=Role.ENGENHEIRO) for n in nomes
    ]
    obra = make_obra(users=[autor, *assinantes])
    documento = make_document(obra, autor, nome="Contrato principal")
    ana = headers_for("ana@example.com")

    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("contrato.pdf", PDF_V1, "application/pdf")},
        headers=ana,
    )
    pedidos = []
    for i, pessoa in enumerate(assinantes, start=1):
        h = headers_for(f"{pessoa.username}@example.com")
        client.put(
            "/me/signature",
            files={"file": ("r.png", RUBRICA + str(i).encode(), "image/png")},
            headers=h,
        )
        pedidos.append(
            client.post(
                f"/documents/{documento.id}/signature-requests",
                json={"signatario_id": str(pessoa.id), **AREA},
                headers=ana,
            ).json()
        )
    return autor, assinantes, documento, ana, pedidos


def _nova_versao(client, headers, document_id, data=PDF_V2):
    return client.post(
        f"/documents/{document_id}/versions",
        files={"file": ("contrato.pdf", data, "application/pdf")},
        headers=headers,
    )


def test_a_new_version_cancels_both_open_requests(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, _, documento, ana, pedidos = _cenario(
        client, make_user, make_obra, make_document, headers_for, n_assinantes=2
    )
    assert len(pedidos) == 2

    assert _nova_versao(client, ana, documento.id).status_code == 201

    db_session.expire_all()
    estados = [p.status for p in db_session.query(SignatureRequest).all()]
    assert estados == [SignatureRequestStatus.CANCELADA] * 2


def test_the_automatic_cancellation_records_the_reason(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, _, documento, ana, _ = _cenario(
        client, make_user, make_obra, make_document, headers_for, n_assinantes=1
    )

    _nova_versao(client, ana, documento.id)

    db_session.expire_all()
    pedido = db_session.query(SignatureRequest).one()
    assert pedido.motivo is not None
    assert "v2" in pedido.motivo
    assert pedido.encerrado_em is not None

    acoes = [log.action for log in db_session.query(AuditLog).all()]
    assert AuditAction.SIGNATURE_CANCELLED.value in acoes


def test_every_affected_signatory_is_notified(
    client, make_user, make_obra, make_document, headers_for, email_sender
):
    _, assinantes, documento, ana, _ = _cenario(
        client, make_user, make_obra, make_document, headers_for, n_assinantes=2
    )
    email_sender.signature_cancellations.clear()

    _nova_versao(client, ana, documento.id)

    avisados = {c.to_email for c in email_sender.signature_cancellations}
    assert avisados == {a.email for a in assinantes}
    assert all("v2" in c.motivo for c in email_sender.signature_cancellations)


def test_a_cancelled_request_can_no_longer_be_signed(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, assinantes, documento, ana, pedidos = _cenario(
        client, make_user, make_obra, make_document, headers_for, n_assinantes=1
    )
    _nova_versao(client, ana, documento.id)

    bruno = headers_for("bruno@example.com")
    resposta = client.post(
        f"/documents/{documento.id}/signature-requests/{pedidos[0]['id']}/sign",
        json={"password": SENHA},
        headers=bruno,
    )

    # This is the gap NODE-029 left open, now closed.
    assert resposta.status_code == 409
    assert "cancelada" in resposta.json()["detail"]
    db_session.expire_all()
    assert db_session.query(AppliedSignature).count() == 0
    assert assinantes


def test_signatures_already_applied_survive_and_stay_bound_to_their_version(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, _, documento, ana, pedidos = _cenario(
        client, make_user, make_obra, make_document, headers_for, n_assinantes=2
    )
    bruno = headers_for("bruno@example.com")
    assinada = client.post(
        f"/documents/{documento.id}/signature-requests/{pedidos[0]['id']}/sign",
        json={"password": SENHA},
        headers=bruno,
    ).json()
    versao_assinada = assinada["document_version_id"]

    _nova_versao(client, ana, documento.id)

    db_session.expire_all()
    # The applied signature is untouched and still names the version it attested to.
    assinaturas = db_session.query(AppliedSignature).all()
    assert len(assinaturas) == 1
    assert str(assinaturas[0].document_version_id) == versao_assinada

    # Only the still-pending one was cancelled.
    estados = {p.status for p in db_session.query(SignatureRequest).all()}
    assert estados == {SignatureRequestStatus.ASSINADA, SignatureRequestStatus.CANCELADA}

    # And it remains queryable through the API.
    lista = client.get(f"/documents/{documento.id}/signatures", headers=ana)
    assert len(lista.json()) == 1


def test_the_existing_version_reset_behaviour_is_unchanged(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    """This node must not disturb what re-uploading already did."""
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    aprovador = make_user(email="dora@example.com", role=Role.DIRETOR)
    obra = make_obra(users=[autor, aprovador])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    dora = headers_for("dora@example.com")

    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", PDF_V1, "application/pdf")},
        headers=ana,
    )
    # Only Administrador and Diretor move the approval flow, so Dora does both
    # steps; she did not create the document, so she may also approve it.
    assert client.post(f"/documents/{documento.id}/review", headers=dora).status_code == 200
    assert client.post(f"/documents/{documento.id}/approve", headers=dora).status_code == 200
    db_session.expire_all()
    assert db_session.get(Document, documento.id).status is DocumentStatus.APROVADO

    _nova_versao(client, ana, documento.id)

    db_session.expire_all()
    atual = db_session.get(Document, documento.id)
    # reset_for_new_version still applies: back to enviado, version incremented.
    assert atual.status is DocumentStatus.ENVIADO
    assert atual.current_version == 2
    assert atual.approved_version is None


def test_a_document_without_pending_requests_uploads_normally(
    client, make_user, make_obra, make_document, headers_for, email_sender
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", PDF_V1, "application/pdf")},
        headers=ana,
    )

    assert _nova_versao(client, ana, documento.id).status_code == 201
    # Nobody to notify, and nothing to cancel.
    assert email_sender.signature_cancellations == []


def test_a_request_can_be_made_again_on_the_new_version(
    client, make_user, make_obra, make_document, headers_for
):
    _, assinantes, documento, ana, _ = _cenario(
        client, make_user, make_obra, make_document, headers_for, n_assinantes=1
    )
    _nova_versao(client, ana, documento.id)

    # The area must be marked afresh on the new pagination — which is the point.
    nova = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(assinantes[0].id), **AREA},
        headers=ana,
    )

    assert nova.status_code == 201
    assert nova.json()["status"] == "pendente"
