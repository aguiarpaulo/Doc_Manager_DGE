"""Refusing and cancelling a signature request.

The asymmetry between the two is the point. **Refusing** is the signatory's move and
always carries a reason, because a refusal without one leaves the requester with
nothing to act on. **Cancelling** belongs to whoever asked, and deliberately *not* to
the signatory: cancelling one's own pending signature would be a silent way to dodge
it, while refusing leaves a reason on the record.
"""

from app.models.audit import AuditAction, AuditLog
from app.models.signature_request import SignatureRequest, SignatureRequestStatus
from app.models.user import Role
from tests.conftest import make_pdf

PDF = make_pdf(texto="contrato")
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


def _preparar(client, make_user, make_obra, make_document, headers_for, com_admin=False):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    pessoas = [autor, assinante]
    if com_admin:
        pessoas.append(make_user(email="admin@example.com", role=Role.ADMINISTRADOR))
    obra = make_obra(users=pessoas)
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


def _recusar(client, headers, doc_id, pedido_id, motivo="Valor divergente na cláusula 4."):
    return client.post(
        f"/documents/{doc_id}/signature-requests/{pedido_id}/decline",
        json={"motivo": motivo},
        headers=headers,
    )


def _cancelar(client, headers, doc_id, pedido_id, motivo=None):
    return client.post(
        f"/documents/{doc_id}/signature-requests/{pedido_id}/cancel",
        json={"motivo": motivo},
        headers=headers,
    )


def _assinar(client, headers, doc_id, pedido_id):
    return client.post(
        f"/documents/{doc_id}/signature-requests/{pedido_id}/sign",
        json={"password": SENHA},
        headers=headers,
    )


# --- recusa -------------------------------------------------------------------------


def test_declining_records_author_time_and_reason(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    resposta = _recusar(client, bruno, documento.id, pedido["id"])

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "recusada"
    assert corpo["motivo"] == "Valor divergente na cláusula 4."
    assert corpo["encerrado_em"] is not None

    db_session.expire_all()
    pedido_db = db_session.query(SignatureRequest).one()
    assert pedido_db.status is SignatureRequestStatus.RECUSADA
    acoes = [log.action for log in db_session.query(AuditLog).all()]
    assert AuditAction.SIGNATURE_DECLINED.value in acoes


def test_a_refusal_without_a_reason_is_rejected(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    vazio = _recusar(client, bruno, documento.id, pedido["id"], motivo="")
    espacos = _recusar(client, bruno, documento.id, pedido["id"], motivo="   ")

    # Without a reason the requester has nothing to act on.
    assert vazio.status_code in (400, 422)
    assert espacos.status_code in (400, 422)


def test_the_reason_is_trimmed_before_being_stored(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    corpo = _recusar(
        client, bruno, documento.id, pedido["id"], motivo="  falta a ART  "
    ).json()

    assert corpo["motivo"] == "falta a ART"


def test_only_the_signatory_may_refuse(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, ana, _, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    # Refusing is a statement about the document; nobody puts words in the
    # signatory's mouth.
    resposta = _recusar(client, ana, documento.id, pedido["id"])

    assert resposta.status_code == 403


# --- cancelamento --------------------------------------------------------------------


def test_the_requester_may_cancel(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _, _, documento, ana, _, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    resposta = _cancelar(client, ana, documento.id, pedido["id"], motivo="documento errado")

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "cancelada"
    db_session.expire_all()
    acoes = [log.action for log in db_session.query(AuditLog).all()]
    assert AuditAction.SIGNATURE_CANCELLED.value in acoes


def test_an_administrator_may_cancel_someone_elses_request(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, _, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for, com_admin=True
    )

    resposta = _cancelar(
        client, headers_for("admin@example.com"), documento.id, pedido["id"]
    )

    assert resposta.status_code == 200


def test_the_signatory_may_not_cancel_their_own_pending_signature(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    resposta = _cancelar(client, bruno, documento.id, pedido["id"])

    # Cancelling would be a silent way to dodge the signature; refusing leaves a
    # reason on the record, and the message says so.
    assert resposta.status_code == 403
    assert "recuse informando o motivo" in resposta.json()["detail"]


def test_an_unrelated_colleague_may_not_cancel(
    client, make_user, make_obra, make_document, headers_for
):
    autor, assinante, documento, _, _, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    make_user(email="carla@example.com", role=Role.ENGENHEIRO)
    # Carla is in no obra, so she cannot even see the document.
    resposta = _cancelar(client, headers_for("carla@example.com"), documento.id, pedido["id"])

    assert resposta.status_code == 404
    assert autor is not None and assinante is not None


def test_cancelling_without_a_reason_is_allowed(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, ana, _, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    # Unlike a refusal, a withdrawal need not be justified to the signatory.
    corpo = _cancelar(client, ana, documento.id, pedido["id"]).json()

    assert corpo["status"] == "cancelada"
    assert corpo["motivo"] is None


# --- estados terminais ----------------------------------------------------------------


def test_a_refused_request_can_no_longer_be_signed(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    from app.models.signature_applied import AppliedSignature

    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    _recusar(client, bruno, documento.id, pedido["id"])

    resposta = _assinar(client, bruno, documento.id, pedido["id"])

    assert resposta.status_code == 409
    assert "recusada" in resposta.json()["detail"]
    db_session.expire_all()
    assert db_session.query(AppliedSignature).count() == 0


def test_a_cancelled_request_can_no_longer_be_signed(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    from app.models.signature_applied import AppliedSignature

    _, _, documento, ana, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    _cancelar(client, ana, documento.id, pedido["id"])

    resposta = _assinar(client, bruno, documento.id, pedido["id"])

    assert resposta.status_code == 409
    assert "cancelada" in resposta.json()["detail"]
    db_session.expire_all()
    assert db_session.query(AppliedSignature).count() == 0


def test_a_signed_request_can_no_longer_be_refused_or_cancelled(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, ana, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    assert _assinar(client, bruno, documento.id, pedido["id"]).status_code == 201

    assert _recusar(client, bruno, documento.id, pedido["id"]).status_code == 409
    assert _cancelar(client, ana, documento.id, pedido["id"]).status_code == 409


def test_refusing_twice_is_rejected(
    client, make_user, make_obra, make_document, headers_for
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    assert _recusar(client, bruno, documento.id, pedido["id"]).status_code == 200
    assert _recusar(client, bruno, documento.id, pedido["id"]).status_code == 409


def test_a_refused_request_frees_a_new_one_for_the_same_person(
    client, make_user, make_obra, make_document, headers_for
):
    _, assinante, documento, ana, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    _recusar(client, bruno, documento.id, pedido["id"])

    # The duplicate guard only blocks *pending* requests, so a corrected ask is
    # possible after a refusal.
    segunda = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(assinante.id), **AREA},
        headers=ana,
    )

    assert segunda.status_code == 201


# --- notificacao ao solicitante -------------------------------------------------------


def test_declining_notifies_the_requester_and_nobody_else(
    client, make_user, make_obra, make_document, headers_for, email_sender
):
    autor, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    email_sender.signature_declines.clear()

    _recusar(client, bruno, documento.id, pedido["id"])

    # Exatamente um e-mail, para quem pediu a assinatura.
    assert len(email_sender.signature_declines) == 1
    enviado = email_sender.signature_declines[0]
    assert enviado.to_email == autor.email
    # E nenhum para o proprio signatario, que ja sabe o que fez.
    assert all(e.to_email != "bruno@example.com" for e in email_sender.signature_declines)


def test_the_refusal_email_carries_document_signer_and_reason(
    client, make_user, make_obra, make_document, headers_for, email_sender
):
    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    email_sender.signature_declines.clear()

    _recusar(client, bruno, documento.id, pedido["id"], motivo="Valor divergente na cláusula 4.")

    enviado = email_sender.signature_declines[0]
    assert enviado.documento == "Contrato principal"
    assert enviado.signatario == "bruno"
    assert enviado.motivo == "Valor divergente na cláusula 4."


def test_no_email_when_the_refusal_is_refused(
    client, make_user, make_obra, make_document, headers_for, email_sender
):
    _, _, documento, ana, _, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )
    email_sender.signature_declines.clear()

    # A solicitante nao e a signataria: 403.
    assert _recusar(client, ana, documento.id, pedido["id"]).status_code == 403

    assert email_sender.signature_declines == []


def test_smtp_failure_does_not_undo_the_refusal(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    from app.services.email import SMTPEmailSender, get_email_sender

    _, _, documento, _, bruno, pedido = _preparar(
        client, make_user, make_obra, make_document, headers_for
    )

    # Servidor que recusa a conexao.
    sender = SMTPEmailSender(
        host="127.0.0.1",
        port=1,
        user="",
        password="",
        from_addr="ged@example.com",
        starttls=False,
        reset_url_base="https://ged.example.com/redefinir-senha",
    )
    client.app.dependency_overrides[get_email_sender] = lambda: sender

    resposta = _recusar(client, bruno, documento.id, pedido["id"])

    # A recusa vale de qualquer forma: perder o aviso e recuperavel.
    assert resposta.status_code == 200
    db_session.expire_all()
    assert db_session.query(SignatureRequest).one().status is SignatureRequestStatus.RECUSADA


def test_the_console_sender_logs_the_refusal_in_development():
    from app.services.email import ConsoleEmailSender

    # Nao deve levantar: e o caminho de desenvolvimento, sem SMTP configurado.
    ConsoleEmailSender().send_signature_declined(
        "ana@example.com", documento="Contrato", signatario="bruno", motivo="motivo"
    )


def test_no_model_or_migration_was_introduced():
    """A demanda proibe mudanca de modelo; este no so acrescenta um e-mail.

    Afirma que a cabeca do alembic nao se moveu, em vez de contar arquivos: uma
    contagem fixa quebra a cada migracao futura sem dizer nada de util.
    """
    import pathlib
    import re

    revisoes, anteriores = set(), set()
    for arquivo in pathlib.Path("alembic/versions").glob("*.py"):
        texto = arquivo.read_text(encoding="utf-8")
        atual = re.search(r"^revision(?::\s*str)?\s*=\s*[\"']([^\"']+)", texto, re.M)
        anterior = re.search(r"^down_revision(?::[^=]+)?\s*=\s*[\"']([^\"']+)", texto, re.M)
        if atual:
            revisoes.add(atual.group(1))
        if anterior:
            anteriores.add(anterior.group(1))

    cabeca = revisoes - anteriores
    # A ultima migracao da DEM-002 continua sendo a cabeca.
    assert cabeca == {"e5f6a7b8c9d0"}
