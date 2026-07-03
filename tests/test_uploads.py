"""NODE-006 contract: MinIO upload + metadata, type/size rejection, duplicate hash."""

from app.models.user import Role

PDF_BYTES = b"%PDF-1.4 fake pdf content"


def _setup(make_user, make_obra, headers_for):
    eng = make_user(email="eng@example.com", role=Role.ENGENHEIRO)
    obra = make_obra("Obra A", users=[eng])
    return eng, obra, headers_for("eng@example.com")


def test_valid_upload_persists_object_and_metadata(
    client, storage, make_user, make_obra, make_document, headers_for
):
    eng, obra, headers = _setup(make_user, make_obra, headers_for)
    doc = make_document(obra, eng, nome="contrato.pdf")

    resp = client.post(
        f"/documents/{doc.id}/versions",
        headers=headers,
        files={"file": ("contrato.pdf", PDF_BYTES, "application/pdf")},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["version"] == 1
    assert body["tamanho"] == len(PDF_BYTES)
    assert body["tipo"] == "application/pdf"
    assert len(body["hash"]) == 64  # sha256 hex digest
    # Object actually landed in storage.
    assert len(storage.objects) == 1


def test_disallowed_type_is_rejected(
    client, make_user, make_obra, make_document, headers_for
):
    eng, obra, headers = _setup(make_user, make_obra, headers_for)
    doc = make_document(obra, eng)
    resp = client.post(
        f"/documents/{doc.id}/versions",
        headers=headers,
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400


def test_oversized_file_is_rejected(
    client, make_user, make_obra, make_document, headers_for
):
    eng, obra, headers = _setup(make_user, make_obra, headers_for)
    doc = make_document(obra, eng)
    big = b"x" * (50 * 1024 * 1024 + 1)
    resp = client.post(
        f"/documents/{doc.id}/versions",
        headers=headers,
        files={"file": ("big.pdf", big, "application/pdf")},
    )
    assert resp.status_code == 413


def test_duplicate_hash_in_same_obra_is_flagged(
    client, make_user, make_obra, make_document, headers_for
):
    eng, obra, headers = _setup(make_user, make_obra, headers_for)
    doc1 = make_document(obra, eng, nome="a.pdf")
    doc2 = make_document(obra, eng, nome="b.pdf")

    first = client.post(
        f"/documents/{doc1.id}/versions",
        headers=headers,
        files={"file": ("a.pdf", PDF_BYTES, "application/pdf")},
    )
    assert first.status_code == 201

    # Same bytes (same sha256) uploaded to another document in the SAME obra -> duplicate.
    dup = client.post(
        f"/documents/{doc2.id}/versions",
        headers=headers,
        files={"file": ("b.pdf", PDF_BYTES, "application/pdf")},
    )
    assert dup.status_code == 409
