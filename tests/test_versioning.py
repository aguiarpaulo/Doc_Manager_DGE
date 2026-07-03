"""NODE-007 contract: re-upload increments+preserves, resets status, approval per version."""

from app.models.document import Document, DocumentStatus
from app.models.user import Role
from app.services.approval import approve

PDF_V1 = b"%PDF-1.4 version one"
PDF_V2 = b"%PDF-1.4 version two (different bytes)"


def _upload(client, headers, doc_id, data, name):
    return client.post(
        f"/documents/{doc_id}/versions",
        headers=headers,
        files={"file": (name, data, "application/pdf")},
    )


def test_reupload_increments_and_preserves_previous_object(
    client, storage, make_user, make_obra, make_document, headers_for
):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    headers = headers_for("eng@example.com")
    doc = make_document(obra, eng)

    v1 = _upload(client, headers, doc.id, PDF_V1, "v1.pdf")
    v2 = _upload(client, headers, doc.id, PDF_V2, "v2.pdf")
    assert v1.json()["version"] == 1
    assert v2.json()["version"] == 2
    # Both versioned objects are retained (previous not overwritten).
    assert len(storage.objects) == 2


def test_new_version_resets_status_to_enviado(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    headers = headers_for("eng@example.com")
    doc = make_document(obra, eng)

    _upload(client, headers, doc.id, PDF_V1, "v1.pdf")
    # Simulate the document having been approved.
    stored = db_session.get(Document, doc.id)
    stored.status = DocumentStatus.APROVADO
    db_session.commit()

    _upload(client, headers, doc.id, PDF_V2, "v2.pdf")
    db_session.refresh(stored)
    assert stored.status == DocumentStatus.ENVIADO


def test_approval_refers_to_approved_version(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    headers = headers_for("eng@example.com")
    doc = make_document(obra, eng)

    _upload(client, headers, doc.id, PDF_V1, "v1.pdf")
    stored = db_session.get(Document, doc.id)
    stored.status = DocumentStatus.EM_ANALISE
    approve(stored)  # domain-level approval of the current version
    db_session.commit()
    db_session.refresh(stored)
    assert stored.status == DocumentStatus.APROVADO
    assert stored.approved_version == 1

    # A new version supersedes the approval and requires re-approval.
    _upload(client, headers, doc.id, PDF_V2, "v2.pdf")
    db_session.refresh(stored)
    assert stored.status == DocumentStatus.ENVIADO
    assert stored.approved_version is None
