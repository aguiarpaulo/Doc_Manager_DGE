"""Carimbo de assinatura no PDF.

O ponto delicado é o sistema de coordenadas. Um canvas de navegador mede a partir do
**canto superior esquerdo**; um PDF mede a partir do **inferior esquerdo**. A inversão
precisa acontecer exatamente uma vez, e é por isso que `to_pdf_rect` é uma função pura:
dá para conferi-la contra números conhecidos em vez de olhar um visualizador e achar
que está certo.
"""

import hashlib
import io

from pypdf import PdfReader
from reportlab.lib.pagesizes import A4, landscape

from app.models.user import Role
from app.services.pdf_stamp import (
    SignaturePlacement,
    UnreadablePdf,
    page_count,
    stamp_pdf,
    to_pdf_rect,
)
from app.utils_time import now_utc
from tests.conftest import make_pdf

RUBRICA_PNG = None  # preenchido abaixo com um PNG real


def _png(cor=(0, 0, 0)) -> bytes:
    """Um PNG mínimo de verdade: o reportlab precisa conseguir decodificar."""
    import struct
    import zlib

    largura = altura = 8
    linhas = b"".join(
        b"\x00" + bytes(cor) * largura for _ in range(altura)
    )
    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return (
            struct.pack(">I", len(dados))
            + tipo
            + dados
            + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + bloco(b"IHDR", struct.pack(">IIBBBBB", largura, altura, 8, 2, 0, 0, 0))
        + bloco(b"IDAT", zlib.compress(linhas))
        + bloco(b"IEND", b"")
    )


RUBRICA_PNG = _png()


def _colocacao(pagina=1, x=0.1, y=0.7, largura=0.3, altura=0.08, nome="bruno"):
    return SignaturePlacement(
        pagina=pagina,
        x=x,
        y=y,
        largura=largura,
        altura=altura,
        rubrica=RUBRICA_PNG,
        signatario=nome,
        assinado_em=now_utc(),
        versao=1,
    )


# --- a conversão de coordenadas -------------------------------------------------------


def test_the_vertical_axis_is_flipped_exactly_once():
    # Retângulo colado no TOPO da página (y=0), altura de 10%.
    x, y, largura, altura = to_pdf_rect(
        x=0.0, y=0.0, largura=0.5, altura=0.1, page_width=600.0, page_height=800.0
    )

    assert x == 0.0
    assert largura == 300.0
    assert altura == 80.0
    # No PDF, a borda inferior desse retângulo fica a 720pt do fundo — quase no topo.
    assert y == 720.0


def test_a_rectangle_at_the_bottom_lands_at_the_bottom():
    _, y, _, _ = to_pdf_rect(
        x=0.0, y=0.9, largura=0.5, altura=0.1, page_width=600.0, page_height=800.0
    )

    # Colado na base: y = 0.
    assert abs(y) < 1e-9


def test_the_conversion_uses_each_pages_own_dimensions():
    """Uma página em paisagem não pode receber as medidas da retrato."""
    retrato = to_pdf_rect(
        x=0.1, y=0.1, largura=0.2, altura=0.1, page_width=595.0, page_height=842.0
    )
    paisagem = to_pdf_rect(
        x=0.1, y=0.1, largura=0.2, altura=0.1, page_width=842.0, page_height=595.0
    )

    # Mesma fração, posições absolutas diferentes: é o que impede a rubrica de
    # escorregar justamente nas páginas de tamanho diferente.
    assert retrato != paisagem
    assert paisagem[0] == 84.2
    assert abs(paisagem[1] - (595.0 - 0.2 * 595.0)) < 1e-9


def test_the_rectangle_never_leaves_the_page():
    for y_frac in (0.0, 0.25, 0.5, 0.92):
        _, y, _, altura = to_pdf_rect(
            x=0.0, y=y_frac, largura=0.1, altura=0.08, page_width=595.0, page_height=842.0
        )
        assert y >= -1e-9
        assert y + altura <= 842.0 + 1e-9


# --- o PDF gerado ----------------------------------------------------------------------


def test_stamping_adds_a_conference_page_and_keeps_the_original_pages():
    original = make_pdf(paginas=3, texto="contrato")

    carimbado = stamp_pdf(original, [_colocacao(pagina=2)], documento="Contrato")

    assert page_count(carimbado) == 4  # 3 originais + conferência
    assert page_count(original) == 3  # o original não mudou


def test_the_conference_page_lists_signer_time_and_version():
    original = make_pdf(paginas=1)
    colocacao = _colocacao(nome="bruno")

    carimbado = stamp_pdf(original, [colocacao], documento="Contrato principal")

    ultima = PdfReader(io.BytesIO(carimbado)).pages[-1].extract_text()
    assert "conferência" in ultima.lower()
    assert "bruno" in ultima
    assert "Contrato principal" in ultima
    assert f"v{colocacao.versao}" in ultima
    assert colocacao.assinado_em.strftime("%d/%m/%Y") in ultima


def test_the_rubric_is_drawn_on_the_marked_page_only():
    original = make_pdf(paginas=3)

    carimbado = stamp_pdf(original, [_colocacao(pagina=2)], documento="Contrato")

    paginas = PdfReader(io.BytesIO(carimbado)).pages
    # Uma imagem foi embutida exatamente na página marcada.
    assert len(paginas[1].images) == 1
    assert len(paginas[0].images) == 0
    assert len(paginas[2].images) == 0


def test_several_signatures_on_the_same_page_are_all_drawn():
    original = make_pdf(paginas=1)

    # Rubricas visualmente diferentes, como as de pessoas diferentes. Com bytes
    # identicos o reportlab reaproveitaria um unico XObject e a contagem de imagens
    # mediria deduplicacao, nao quantas rubricas foram desenhadas.
    colocacoes = []
    for cor, nome, y in (
        ((0, 0, 0), "bruno", 0.2),
        ((255, 0, 0), "carla", 0.5),
        ((0, 0, 255), "diego", 0.8),
    ):
        colocacoes.append(
            SignaturePlacement(
                pagina=1,
                x=0.1,
                y=y,
                largura=0.3,
                altura=0.08,
                rubrica=_png(cor),
                signatario=nome,
                assinado_em=now_utc(),
                versao=1,
            )
        )

    carimbado = stamp_pdf(original, colocacoes, documento="Contrato")

    paginas = PdfReader(io.BytesIO(carimbado)).pages
    assert len(paginas[0].images) == 3
    texto = paginas[-1].extract_text()
    for nome in ("bruno", "carla", "diego"):
        assert nome in texto


def test_a_document_with_mixed_page_sizes_keeps_each_pages_geometry():
    """O caso que a conversão precisa tratar."""
    original = make_pdf(tamanhos=[A4, landscape(A4), A4])

    carimbado = stamp_pdf(original, [_colocacao(pagina=2)], documento="Contrato")

    paginas = PdfReader(io.BytesIO(carimbado)).pages
    # A página em paisagem continua em paisagem depois do carimbo.
    assert float(paginas[1].mediabox.width) > float(paginas[1].mediabox.height)
    assert float(paginas[0].mediabox.width) < float(paginas[0].mediabox.height)
    assert len(paginas[1].images) == 1


def test_without_signatures_the_bytes_are_returned_untouched():
    original = make_pdf(paginas=2)

    resultado = stamp_pdf(original, [], documento="Contrato")

    # Byte a byte: nada é regravado quando não há o que desenhar.
    assert resultado == original


def test_an_unreadable_pdf_raises_a_typed_error_not_a_low_level_one():
    with __import__("pytest").raises(UnreadablePdf):
        page_count(b"isto nao e um pdf")


# --- integração com o download ----------------------------------------------------------


def _cenario_assinado(client, make_user, make_obra, make_document, headers_for, storage):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor, nome="Contrato principal")
    ana = headers_for("ana@example.com")
    bruno = headers_for("bruno@example.com")

    pdf = make_pdf(paginas=2, texto="contrato")
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", pdf, "application/pdf")},
        headers=ana,
    )
    client.put(
        "/me/signature", files={"file": ("r.png", RUBRICA_PNG, "image/png")}, headers=bruno
    )
    pedido = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={
            "signatario_id": str(assinante.id),
            "pagina": 2,
            "x": 0.1,
            "y": 0.7,
            "largura": 0.3,
            "altura": 0.08,
            "page_width": 595.0,
            "page_height": 842.0,
        },
        headers=ana,
    ).json()
    return documento, ana, bruno, pedido, pdf


def test_downloading_a_signed_document_returns_the_stamped_copy(
    client, make_user, make_obra, make_document, headers_for, storage
):
    documento, ana, bruno, pedido, pdf = _cenario_assinado(
        client, make_user, make_obra, make_document, headers_for, storage
    )
    client.post(
        f"/documents/{documento.id}/signature-requests/{pedido['id']}/sign",
        json={"password": "s3cret-pass"},
        headers=bruno,
    )

    baixado = client.get(f"/documents/{documento.id}/versions/1/download", headers=ana)

    assert baixado.status_code == 200
    assert baixado.headers["content-type"] == "application/pdf"
    paginas = PdfReader(io.BytesIO(baixado.content)).pages
    assert len(paginas) == 3  # 2 + conferência
    assert len(paginas[1].images) == 1  # a rubrica, na página marcada
    assert "bruno" in paginas[-1].extract_text()


def test_the_stored_object_and_its_hash_are_unchanged_by_signing(
    client, db_session, make_user, make_obra, make_document, headers_for, storage
):
    from app.models.document_version import DocumentVersion

    documento, ana, bruno, pedido, pdf = _cenario_assinado(
        client, make_user, make_obra, make_document, headers_for, storage
    )
    db_session.expire_all()
    versao = db_session.query(DocumentVersion).one()
    hash_antes = versao.hash
    bytes_antes = storage.objects[versao.object_key]

    client.post(
        f"/documents/{documento.id}/signature-requests/{pedido['id']}/sign",
        json={"password": "s3cret-pass"},
        headers=bruno,
    )
    client.get(f"/documents/{documento.id}/versions/1/download", headers=ana)

    db_session.expire_all()
    versao = db_session.query(DocumentVersion).one()
    # O carimbo é derivado: o objeto guardado e seu SHA-256 continuam idênticos.
    assert versao.hash == hash_antes
    assert storage.objects[versao.object_key] == bytes_antes
    assert hashlib.sha256(bytes_antes).hexdigest() == hash_antes


def test_an_unsigned_document_downloads_byte_for_byte(
    client, make_user, make_obra, make_document, headers_for
):
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    pdf = make_pdf(paginas=2)
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", pdf, "application/pdf")},
        headers=ana,
    )

    baixado = client.get(f"/documents/{documento.id}/versions/1/download", headers=ana)

    assert baixado.content == pdf


def test_stamping_creates_no_version_and_does_not_move_the_approval_status(
    client, db_session, make_user, make_obra, make_document, headers_for, storage
):
    from app.models.document import Document, DocumentStatus
    from app.models.document_version import DocumentVersion

    documento, ana, bruno, pedido, _ = _cenario_assinado(
        client, make_user, make_obra, make_document, headers_for, storage
    )
    client.post(
        f"/documents/{documento.id}/signature-requests/{pedido['id']}/sign",
        json={"password": "s3cret-pass"},
        headers=bruno,
    )

    for _ in range(3):  # baixar várias vezes não acumula nada
        client.get(f"/documents/{documento.id}/versions/1/download", headers=ana)

    db_session.expire_all()
    assert db_session.query(DocumentVersion).count() == 1
    atual = db_session.get(Document, documento.id)
    assert atual.current_version == 1
    assert atual.status is DocumentStatus.ENVIADO


def test_marking_a_page_the_document_does_not_have_is_refused(
    client, make_user, make_obra, make_document, headers_for
):
    """Pendência deixada em aberto no NODE-027, fechada agora que há leitor de PDF."""
    autor = make_user(email="ana@example.com", role=Role.ENGENHEIRO)
    assinante = make_user(email="bruno@example.com", role=Role.ENGENHEIRO)
    obra = make_obra(users=[autor, assinante])
    documento = make_document(obra, autor)
    ana = headers_for("ana@example.com")
    client.post(
        f"/documents/{documento.id}/versions",
        files={"file": ("c.pdf", make_pdf(paginas=3), "application/pdf")},
        headers=ana,
    )

    resposta = client.post(
        f"/documents/{documento.id}/signature-requests",
        json={
            "signatario_id": str(assinante.id),
            "pagina": 99,
            "x": 0.1,
            "y": 0.7,
            "largura": 0.3,
            "altura": 0.08,
            "page_width": 595.0,
            "page_height": 842.0,
        },
        headers=ana,
    )

    assert resposta.status_code == 400
    assert "3 página" in resposta.json()["detail"]
