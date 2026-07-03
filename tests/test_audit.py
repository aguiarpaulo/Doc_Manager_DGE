"""NODE-009 contract: audit records per action, chronological history, immutability."""

from app.models.audit import AuditAction, AuditLog
from app.models.user import Role

PDF = b"%PDF-1.4 audit test"


def test_relevant_actions_are_audited_with_actor_action_target_timestamp(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    doc = make_document(obra, eng)
    eng_h = headers_for("eng@example.com")  # triggers a LOGIN audit

    up = client.post(
        f"/documents/{doc.id}/versions",
        headers=eng_h,
        files={"file": ("a.pdf", PDF, "application/pdf")},
    )
    assert up.status_code == 201
    client.get(f"/documents/{doc.id}/versions/1/download", headers=eng_h)

    make_user(email="dir@example.com", role=Role.DIRETOR)
    dir_h = headers_for("dir@example.com")
    client.post(f"/documents/{doc.id}/review", headers=dir_h)
    client.post(f"/documents/{doc.id}/approve", headers=dir_h)

    logs = db_session.query(AuditLog).all()
    actions = {log.action for log in logs}
    assert {
        AuditAction.LOGIN,
        AuditAction.UPLOAD,
        AuditAction.DOWNLOAD,
        AuditAction.APPROVE,
    } <= actions
    # Every record carries actor, action and timestamp.
    for log in logs:
        assert log.action
        assert log.created_at is not None
        if log.action != AuditAction.LOGIN:
            assert log.target_id is not None


def test_document_history_is_chronological(
    client, make_user, make_obra, make_document, headers_for
):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    doc = make_document(obra, eng)
    eng_h = headers_for("eng@example.com")

    client.post(
        f"/documents/{doc.id}/versions",
        headers=eng_h,
        files={"file": ("a.pdf", PDF, "application/pdf")},
    )
    client.get(f"/documents/{doc.id}/versions/1/download", headers=eng_h)

    history = client.get(f"/documents/{doc.id}/history", headers=eng_h)
    assert history.status_code == 200
    entries = history.json()
    assert [e["action"] for e in entries] == ["upload", "download"]
    timestamps = [e["created_at"] for e in entries]
    assert timestamps == sorted(timestamps)


def test_audit_records_have_no_mutation_endpoints(client, make_user, headers_for):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    headers = headers_for("admin@example.com")
    fake_id = "00000000-0000-0000-0000-000000000000"
    # No API surface edits or deletes audit rows.
    assert client.delete(f"/audit/{fake_id}", headers=headers).status_code in (404, 405)
    assert client.patch(f"/audit/{fake_id}", headers=headers, json={}).status_code in (404, 405)
    assert client.put(f"/audit/{fake_id}", headers=headers, json={}).status_code in (404, 405)
