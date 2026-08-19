"""The document's timeline: every step, with who and when.

The point of this node is that a reader can reconstruct what happened to a document
without asking anyone. That only works if **no step is missing** — and one was:
`POST /documents/{id}/review` moved a document into análise while leaving no trace
at all, so the timeline could not show it. NODE-032 added it.
"""

from app.models.audit import AuditAction, AuditLog
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


def _jornada_completa(client, make_user, make_obra, make_document, headers_for):
    """Percorre as nove etapas que o contrato enumera."""
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    bruno = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    carla = make_user(email="carla@example.com", role=Role.ENGENHEIRO)
    dora = make_user(email="dora@example.com", role=Role.DIRETOR)
    obra = make_obra(users=[autor, bruno, carla, dora])
    documento = make_document(obra, autor, nome="Contrato principal")

    h_ana = headers_for("ana@example.com")
    h_bruno = headers_for("bruno@example.com")
    h_carla = headers_for("carla@example.com")
    h_dora = headers_for("dora@example.com")

    for h in (h_bruno, h_carla):
        client.put("/me/signature", files={"file": ("r.png", RUBRICA, "image/png")}, headers=h)

    # 1. upload
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", PDF_V1, "application/pdf")},
        headers=h_ana,
    )
    # 2. solicitação + 3. assinatura
    p1 = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(bruno.id), **AREA},
        headers=h_ana,
    ).json()
    client.post(
        f"/documents/{documento.id}/signature-requests/{p1['id']}/sign",
        json={"password": SENHA},
        headers=h_bruno,
    )
    # 4. recusa
    p2 = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(carla.id), **AREA},
        headers=h_ana,
    ).json()
    client.post(
        f"/documents/{documento.id}/signature-requests/{p2['id']}/decline",
        json={"motivo": "cláusula 4 divergente"},
        headers=h_carla,
    )
    # 5. cancelamento (automático, pela nova versão) + 6. nova versão
    p3 = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={"signatario_id": str(carla.id), **AREA},
        headers=h_ana,
    ).json()
    assert p3["status"] == "pendente"
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", PDF_V2, "application/pdf")},
        headers=h_ana,
    )
    # 7. envio para análise + 8. aprovação (ou rejeição)
    client.post(f"/documents/{documento.id}/review", headers=h_dora)
    client.post(f"/documents/{documento.id}/approve", headers=h_dora)
    # 9. download
    client.get(f"/documents/{documento.id}/versions/2/download", headers=h_ana)

    return documento, h_ana, h_dora


def test_every_step_of_the_journey_appears_in_the_timeline(
    client, make_user, make_obra, make_document, headers_for
):
    documento, h_ana, _ = _jornada_completa(
        client, make_user, make_obra, make_document, headers_for
    )

    etapas = client.get(f"/documents/{documento.id}/history", headers=h_ana).json()
    acoes = [e["action"] for e in etapas]

    esperadas = {
        AuditAction.UPLOAD.value,
        AuditAction.NEW_VERSION.value,
        AuditAction.REVIEW.value,
        AuditAction.APPROVE.value,
        AuditAction.SIGNATURE_REQUESTED.value,
        AuditAction.SIGNED.value,
        AuditAction.SIGNATURE_DECLINED.value,
        AuditAction.SIGNATURE_CANCELLED.value,
        AuditAction.DOWNLOAD.value,
    }
    faltando = esperadas - set(acoes)
    assert not faltando, f"etapas ausentes na linha do tempo: {faltando}"


def test_sending_to_review_leaves_a_trace(
    client, db_session, make_user, make_obra, make_document, headers_for
):
    """Before NODE-032 this transition left none."""
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    dora = make_user(email="dora@example.com", role=Role.DIRETOR)
    obra = make_obra(users=[autor, dora])
    documento = make_document(obra, autor)
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", PDF_V1, "application/pdf")},
        headers=headers_for("ana@example.com"),
    )

    client.post(f"/documents/{documento.id}/review", headers=headers_for("dora@example.com"))

    db_session.expire_all()
    registros = [
        log for log in db_session.query(AuditLog).all() if log.action == AuditAction.REVIEW.value
    ]
    assert len(registros) == 1
    assert registros[0].actor_id == dora.id
    assert registros[0].created_at is not None


def test_first_upload_and_a_new_version_are_distinct_steps(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor])
    documento = make_document(obra, autor)
    h = headers_for("ana@example.com")
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", PDF_V1, "application/pdf")},
        headers=h,
    )
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", PDF_V2, "application/pdf")},
        headers=h,
    )

    acoes = [
        e["action"] for e in client.get(f"/documents/{documento.id}/history", headers=h).json()
    ]

    # To a reader these are different events, so they are different actions.
    assert acoes.count(AuditAction.UPLOAD.value) == 1
    assert acoes.count(AuditAction.NEW_VERSION.value) == 1


def test_each_action_produces_exactly_one_record(
    client, make_user, make_obra, make_document, headers_for
):
    documento, h_ana, _ = _jornada_completa(
        client, make_user, make_obra, make_document, headers_for
    )

    etapas = client.get(f"/documents/{documento.id}/history", headers=h_ana).json()
    acoes = [e["action"] for e in etapas]

    # One upload, one new version, one review, one approval, one signature, one
    # refusal — no duplicates from a double-commit.
    for acao in (
        AuditAction.UPLOAD.value,
        AuditAction.NEW_VERSION.value,
        AuditAction.REVIEW.value,
        AuditAction.APPROVE.value,
        AuditAction.SIGNED.value,
        AuditAction.SIGNATURE_DECLINED.value,
    ):
        assert acoes.count(acao) == 1, f"{acao} apareceu {acoes.count(acao)} vezes"


def test_the_timeline_is_chronological(
    client, make_user, make_obra, make_document, headers_for
):
    documento, h_ana, _ = _jornada_completa(
        client, make_user, make_obra, make_document, headers_for
    )

    etapas = client.get(f"/documents/{documento.id}/history", headers=h_ana).json()
    horarios = [e["created_at"] for e in etapas]

    assert horarios == sorted(horarios)
    # And the first step really is the upload.
    assert etapas[0]["action"] == AuditAction.UPLOAD.value


def test_every_step_names_who_acted_and_when(
    client, make_user, make_obra, make_document, headers_for
):
    documento, h_ana, _ = _jornada_completa(
        client, make_user, make_obra, make_document, headers_for
    )

    etapas = client.get(f"/documents/{documento.id}/history", headers=h_ana).json()

    for etapa in etapas:
        assert etapa["created_at"]
        assert etapa["actor_id"]
        # Resolved for display: the reader cannot look up a uuid.
        assert etapa["actor_nome"]


def test_the_signature_step_names_the_signatory_and_its_time(
    client, make_user, make_obra, make_document, headers_for
):
    documento, h_ana, _ = _jornada_completa(
        client, make_user, make_obra, make_document, headers_for
    )

    etapas = client.get(f"/documents/{documento.id}/history", headers=h_ana).json()
    assinatura = next(e for e in etapas if e["action"] == AuditAction.SIGNED.value)

    assert assinatura["actor_nome"] == "bruno"
    assert "bruno" in (assinatura["detail"] or "")
    assert assinatura["created_at"]


def test_the_refusal_step_carries_the_reason(
    client, make_user, make_obra, make_document, headers_for
):
    documento, h_ana, _ = _jornada_completa(
        client, make_user, make_obra, make_document, headers_for
    )

    etapas = client.get(f"/documents/{documento.id}/history", headers=h_ana).json()
    recusa = next(e for e in etapas if e["action"] == AuditAction.SIGNATURE_DECLINED.value)

    assert "cláusula 4 divergente" in recusa["detail"]
    assert recusa["actor_nome"] == "carla"


# --- imutabilidade e escopo -----------------------------------------------------------


def test_no_endpoint_can_edit_or_delete_a_timeline_record(client):
    """The trail is append-only: nothing in the API expresses changing it."""
    rotas = [
        (r.path, sorted(getattr(r, "methods", []) or []))
        for r in client.app.routes
        if getattr(r, "path", "")
    ]

    for caminho, metodos in rotas:
        if "history" in caminho or "audit" in caminho:
            # Reading only.
            assert set(metodos) <= {"GET", "HEAD"}, f"{caminho} expõe {metodos}"

    # And there is no audit route at all beyond the per-document history.
    caminhos = {c for c, _ in rotas}
    assert not any(c.startswith("/audit") for c in caminhos)


def test_the_history_endpoint_is_read_only(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor])
    documento = make_document(obra, autor)
    h = headers_for("ana@example.com")

    for metodo in ("post", "put", "patch", "delete"):
        resposta = getattr(client, metodo)(
            f"/documents/{documento.id}/history", headers=h
        )
        assert resposta.status_code == 405


def test_someone_outside_the_obra_cannot_read_the_timeline(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    make_user(email="forasteiro@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor])
    documento = make_document(obra, autor)
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", PDF_V1, "application/pdf")},
        headers=headers_for("ana@example.com"),
    )

    resposta = client.get(
        f"/documents/{documento.id}/history", headers=headers_for("forasteiro@example.com")
    )

    # 404 rather than 403: existence stays hidden outside the scope.
    assert resposta.status_code == 404


def test_the_timeline_requires_authentication(
    client, make_user, make_obra, make_document
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor])
    documento = make_document(obra, autor)

    assert client.get(f"/documents/{documento.id}/history").status_code in (401, 403)
