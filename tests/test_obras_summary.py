"""Contract for `GET /obras/summary`: a dashboard-ready aggregate per obra.

Each entry carries the obra's document counts by status and the single most
recent document-lifecycle event (who did what, and when) — so the SPA's home
page never has to fetch every document of every obra just to show a summary.
"""

import uuid
from datetime import UTC, datetime, timedelta

from app.models.audit import AuditAction, AuditLog
from app.models.user import Role
from tests.conftest import make_pdf

PDF = make_pdf(texto="conteudo")


def _make_obra(client, admin_headers, nome="Obra A"):
    return client.post("/obras", headers=admin_headers, json={"nome": nome}).json()


def _new_document(client, headers, obra_id, nome="Documento"):
    return client.post(
        "/documents",
        headers=headers,
        json={"nome": nome, "obra_id": obra_id, "categoria": "contrato"},
    ).json()


def _upload_version(client, headers, document_id):
    return client.post(
        f"/documents/{document_id}/versions",
        files={"file": ("doc.pdf", PDF, "application/pdf")},
        headers=headers,
    )


def test_summary_counts_documents_by_status_per_obra(client, make_user, headers_for):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    admin_h = headers_for("admin@example.com")
    eng_h = headers_for("eng@example.com")

    obra_id = _make_obra(client, admin_h)["id"]
    client.put(f"/obras/{obra_id}/users/{eng.id}", headers=admin_h)

    _new_document(client, eng_h, obra_id, "Enviado")

    em_analise = _new_document(client, eng_h, obra_id, "Em analise")
    client.post(f"/documents/{em_analise['id']}/review", headers=admin_h)

    aprovado = _new_document(client, eng_h, obra_id, "Aprovado")
    client.post(f"/documents/{aprovado['id']}/review", headers=admin_h)
    client.post(f"/documents/{aprovado['id']}/approve", headers=admin_h)

    rejeitado = _new_document(client, eng_h, obra_id, "Rejeitado")
    client.post(f"/documents/{rejeitado['id']}/review", headers=admin_h)
    client.post(f"/documents/{rejeitado['id']}/reject", headers=admin_h)

    resumo = client.get("/obras/summary", headers=admin_h).json()
    da_obra = next(o for o in resumo if o["obra"]["id"] == obra_id)

    assert da_obra["total_documents"] == 4
    assert da_obra["by_status"] == {
        "enviado": 1,
        "em_analise": 1,
        "aprovado": 1,
        "rejeitado": 1,
    }


def test_summary_latest_activity_ignores_views_and_tracks_the_newest_update(
    client, make_user, headers_for
):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    admin_h = headers_for("admin@example.com")
    eng_h = headers_for("eng@example.com")

    obra_id = _make_obra(client, admin_h)["id"]
    client.put(f"/obras/{obra_id}/users/{eng.id}", headers=admin_h)

    doc = _new_document(client, eng_h, obra_id, "Contrato")
    _upload_version(client, eng_h, doc["id"])

    # A view (download) must never become "latest activity" — it isn't an update.
    client.get(f"/documents/{doc['id']}/versions/1/download", headers=eng_h)

    resumo = client.get("/obras/summary", headers=eng_h).json()
    atividade = next(o for o in resumo if o["obra"]["id"] == obra_id)["latest_activity"]
    assert atividade is not None
    assert atividade["action"] == "upload"
    assert atividade["document_nome"] == "Contrato"
    assert atividade["actor_nome"] == "eng"

    # A later real update (review) must overtake the upload as the latest activity.
    client.post(f"/documents/{doc['id']}/review", headers=admin_h)

    resumo = client.get("/obras/summary", headers=eng_h).json()
    atividade = next(o for o in resumo if o["obra"]["id"] == obra_id)["latest_activity"]
    assert atividade["action"] == "review"
    assert atividade["actor_nome"] == "admin"


def test_summary_latest_activity_is_newest_across_all_of_the_obras_documents(
    client, make_user, headers_for
):
    """The window must partition by obra, not collapse to one document's history."""
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    admin_h = headers_for("admin@example.com")
    eng_h = headers_for("eng@example.com")

    obra_id = _make_obra(client, admin_h)["id"]
    client.put(f"/obras/{obra_id}/users/{eng.id}", headers=admin_h)

    older = _new_document(client, eng_h, obra_id, "Documento antigo")
    _upload_version(client, eng_h, older["id"])
    newer = _new_document(client, eng_h, obra_id, "Documento novo")
    client.post(f"/documents/{newer['id']}/review", headers=admin_h)

    resumo = client.get("/obras/summary", headers=admin_h).json()
    atividade = next(o for o in resumo if o["obra"]["id"] == obra_id)["latest_activity"]

    # "review" on the second document happened after "upload" on the first —
    # the summary must reflect whichever document in the obra was touched last.
    assert atividade["action"] == "review"
    assert atividade["document_nome"] == "Documento novo"


def test_summary_latest_activity_survives_document_deletion(client, make_user, headers_for):
    """Deletion excludes a document from status *counts*, not from history — the
    audit trail is immutable, so the delete event itself must still be the obra's
    latest activity, not silently disappear along with the document it targeted."""
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com")

    obra_id = _make_obra(client, admin_h)["id"]
    doc = _new_document(client, admin_h, obra_id, "Contrato")

    client.delete(f"/documents/{doc['id']}", headers=admin_h)

    resumo = client.get("/obras/summary", headers=admin_h).json()
    da_obra = next(o for o in resumo if o["obra"]["id"] == obra_id)

    assert da_obra["latest_activity"] is not None
    assert da_obra["latest_activity"]["action"] == "delete"
    # Still correctly excluded from counts — deletion hides it from the tally,
    # just not from the fact that something happened.
    assert da_obra["total_documents"] == 0


def test_summary_scoped_to_accessible_obras(client, make_user, headers_for):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    admin_h = headers_for("admin@example.com")
    eng_h = headers_for("eng@example.com")

    obra_a = _make_obra(client, admin_h, "Obra A")["id"]
    obra_b = _make_obra(client, admin_h, "Obra B")["id"]
    client.put(f"/obras/{obra_a}/users/{eng.id}", headers=admin_h)

    resumo = client.get("/obras/summary", headers=eng_h).json()
    ids = {o["obra"]["id"] for o in resumo}

    assert ids == {obra_a}
    assert obra_b not in ids


def test_summary_includes_obra_with_no_documents(client, make_user, headers_for):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com")
    obra_id = _make_obra(client, admin_h, "Obra vazia")["id"]

    resumo = client.get("/obras/summary", headers=admin_h).json()
    da_obra = next(o for o in resumo if o["obra"]["id"] == obra_id)

    assert da_obra["total_documents"] == 0
    assert da_obra["by_status"] == {
        "enviado": 0,
        "em_analise": 0,
        "aprovado": 0,
        "rejeitado": 0,
    }
    assert da_obra["latest_activity"] is None


def test_summary_excludes_archived_obras(client, make_user, headers_for):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com")
    obra_id = _make_obra(client, admin_h, "Obra arquivada")["id"]

    client.delete(f"/obras/{obra_id}", headers=admin_h)

    resumo = client.get("/obras/summary", headers=admin_h).json()
    assert obra_id not in {o["obra"]["id"] for o in resumo}


def test_summary_orders_by_latest_activity_and_caps_at_ten(
    client, make_user, headers_for, db_session
):
    make_user(email="admin@example.com", role=Role.ADMINISTRADOR)
    admin_h = headers_for("admin@example.com")

    ativas: list[str] = []
    base = datetime(2026, 1, 1, tzinfo=UTC)
    for i in range(10):
        obra_id = _make_obra(client, admin_h, f"Obra ativa {i}")["id"]
        doc = _new_document(client, admin_h, obra_id, "Documento")
        _upload_version(client, admin_h, doc["id"])
        # Exactly one document per obra here, so exactly one UPLOAD row exists per
        # obra — `.one()` would raise if this test ever grew a second document per
        # obra without also updating this lookup.
        entry = (
            db_session.query(AuditLog)
            .filter_by(target_id=uuid.UUID(doc["id"]), action=AuditAction.UPLOAD.value)
            .one()
        )
        entry.created_at = base + timedelta(seconds=i)
        ativas.append(obra_id)
    db_session.commit()

    # An 11th obra with no activity at all — it must lose its spot to the ten
    # obras that actually have something to show, not just by insertion order.
    sem_atividade = _make_obra(client, admin_h, "Obra sem atividade")["id"]

    resumo = client.get("/obras/summary", headers=admin_h).json()

    assert len(resumo) == 10
    ids = [o["obra"]["id"] for o in resumo]
    assert sem_atividade not in ids
    # Most recently active first.
    assert ids == list(reversed(ativas))
