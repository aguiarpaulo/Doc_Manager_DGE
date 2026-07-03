"""NODE-011 contract: admin-only soft-delete, versions retained, hidden + audited."""

from app.models.audit import AuditAction, AuditLog
from app.models.document import Document
from app.models.document_version import DocumentVersion
from app.models.user import Role

PDF = b"%PDF-1.4 delete test"


def _doc_with_version(client, make_user, make_obra, make_document, headers_for):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    doc = make_document(obra, eng)
    eng_h = headers_for("eng@example.com")
    client.post(
        f"/documents/{doc.id}/versions",
        headers=eng_h,
        files={"file": ("a.pdf", PDF, "application/pdf")},
    )
    return eng, obra, doc


def test_only_admin_can_delete(client, make_user, make_obra, make_document, headers_for):
    _eng, _obra, doc = _doc_with_version(client, make_user, make_obra, make_document, headers_for)
    make_user(email="dir@example.com", role=Role.DIRETOR)

    eng_del = client.delete(f"/documents/{doc.id}", headers=headers_for("eng@example.com"))
    dir_del = client.delete(f"/documents/{doc.id}", headers=headers_for("dir@example.com"))
    assert eng_del.status_code == 403
    assert dir_del.status_code == 403


def test_soft_delete_retains_versions_and_objects(
    client, storage, db_session, make_user, make_obra, make_document, headers_for
):
    _eng, _obra, doc = _doc_with_version(client, make_user, make_obra, make_document, headers_for)
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com")

    objects_before = len(storage.objects)
    resp = client.delete(f"/documents/{doc.id}", headers=admin_h)
    assert resp.status_code == 204

    stored = db_session.get(Document, doc.id)
    assert stored.is_deleted is True
    # Versions and stored objects are NOT removed.
    versions = db_session.query(DocumentVersion).filter_by(document_id=doc.id).all()
    assert len(versions) == 1
    assert len(storage.objects) == objects_before


def test_deleted_document_is_hidden_and_delete_is_audited(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    _eng, _obra, doc = _doc_with_version(client, make_user, make_obra, make_document, headers_for)
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com")

    client.delete(f"/documents/{doc.id}", headers=admin_h)

    # Hidden from get and search.
    assert client.get(f"/documents/{doc.id}", headers=admin_h).status_code == 404
    assert client.get("/documents", headers=admin_h).json() == []
    # Delete event recorded.
    delete_logs = (
        db_session.query(AuditLog).filter_by(action=AuditAction.DELETE, target_id=doc.id).all()
    )
    assert len(delete_logs) == 1
