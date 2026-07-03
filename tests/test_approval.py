"""NODE-008 contract: role-gated transitions, no self-approval, invalid transitions rejected."""

from app.models.user import Role


def _doc_by_engineer(client, make_user, make_obra, make_document, headers_for):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    doc = make_document(obra, eng)
    return eng, obra, doc


def test_diretor_can_move_through_review_and_approve(
    client, make_user, make_obra, make_document, headers_for
):
    _eng, _obra, doc = _doc_by_engineer(client, make_user, make_obra, make_document, headers_for)
    make_user(email="dir@example.com", role=Role.DIRETOR)
    dir_h = headers_for("dir@example.com")

    reviewed = client.post(f"/documents/{doc.id}/review", headers=dir_h)
    assert reviewed.json()["status"] == "em_analise"
    approved = client.post(f"/documents/{doc.id}/approve", headers=dir_h)
    assert approved.json()["status"] == "aprovado"


def test_admin_can_reject_after_review(
    client, make_user, make_obra, make_document, headers_for
):
    _eng, _obra, doc = _doc_by_engineer(client, make_user, make_obra, make_document, headers_for)
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com")

    client.post(f"/documents/{doc.id}/review", headers=admin_h)
    rejected = client.post(f"/documents/{doc.id}/reject", headers=admin_h)
    assert rejected.json()["status"] == "rejeitado"


def test_engenheiro_and_financeiro_cannot_approve(
    client, make_user, make_obra, make_document, headers_for
):
    eng, obra, doc = _doc_by_engineer(client, make_user, make_obra, make_document, headers_for)
    fin = make_user(email="fin@example.com", role=Role.FINANCEIRO)
    obra.users.append(fin)
    eng_h = headers_for("eng@example.com")
    fin_h = headers_for("fin@example.com")

    assert client.post(f"/documents/{doc.id}/review", headers=eng_h).status_code == 403
    assert client.post(f"/documents/{doc.id}/approve", headers=fin_h).status_code == 403


def test_cannot_approve_own_document(
    client, make_user, make_obra, make_document, headers_for
):
    # Diretor creates the document, then tries to approve it himself.
    diretor = make_user(email="dir@example.com", role=Role.DIRETOR)
    obra = make_obra("Obra A")
    doc = make_document(obra, diretor)
    dir_h = headers_for("dir@example.com")

    client.post(f"/documents/{doc.id}/review", headers=dir_h)
    resp = client.post(f"/documents/{doc.id}/approve", headers=dir_h)
    assert resp.status_code == 403


def test_invalid_transition_is_rejected(
    client, make_user, make_obra, make_document, headers_for
):
    _eng, _obra, doc = _doc_by_engineer(client, make_user, make_obra, make_document, headers_for)
    make_user(email="dir@example.com", role=Role.DIRETOR)
    dir_h = headers_for("dir@example.com")

    # Approving a freshly-submitted (Enviado) document skips Em análise -> invalid.
    resp = client.post(f"/documents/{doc.id}/approve", headers=dir_h)
    assert resp.status_code == 409
