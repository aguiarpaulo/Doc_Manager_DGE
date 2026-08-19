"""Drawing signatures onto a copy of a PDF.

The original object in storage is never touched. This produces a **derived** file on
demand, so the stored bytes and their SHA-256 stay exactly as uploaded — which is what
lets a signature coexist with the document's own integrity record.

The one genuinely error-prone thing here is the coordinate system. A browser canvas
measures from the **top-left** and a PDF measures from the **bottom-left**, so the
flip has to happen exactly once. It happens in `to_pdf_rect`, which is a pure function
precisely so it can be tested against known numbers instead of eyeballed in a viewer.

Both libraries are pure Python, so nothing native enters the container.
"""

import io
from dataclasses import dataclass
from datetime import datetime

from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


@dataclass(frozen=True)
class SignaturePlacement:
    """Where one rubric goes, and what the conference page should say about it."""

    pagina: int  # 1-based, as the reader counts
    x: float  # fractions of the page, origin top-left, as drawn
    y: float
    largura: float
    altura: float
    rubrica: bytes
    signatario: str
    assinado_em: datetime
    versao: int


def to_pdf_rect(
    *,
    x: float,
    y: float,
    largura: float,
    altura: float,
    page_width: float,
    page_height: float,
) -> tuple[float, float, float, float]:
    """Convert a top-left fractional rectangle into PDF points.

    Returns `(x, y, largura, altura)` with the origin at the bottom-left, ready for
    reportlab's `drawImage`.

    The vertical flip is the whole point: a rectangle whose top edge sits at 10% of
    the page has its *bottom* edge at `height - (0.10 + altura) * height`. Doing this
    in two places is how a document ends up flipped twice and nobody notices.
    """
    largura_pt = largura * page_width
    altura_pt = altura * page_height
    x_pt = x * page_width
    # `y` measures the distance from the top down to the rectangle's top edge.
    y_pt = page_height - (y + altura) * page_height
    return x_pt, y_pt, largura_pt, altura_pt


def _overlay_for_page(
    largura_pagina: float,
    altura_pagina: float,
    colocacoes: list[SignaturePlacement],
) -> PdfReader:
    """A transparent page carrying just the rubrics that belong on this page."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(largura_pagina, altura_pagina))

    for colocacao in colocacoes:
        x, y, largura, altura = to_pdf_rect(
            x=colocacao.x,
            y=colocacao.y,
            largura=colocacao.largura,
            altura=colocacao.altura,
            # Positioned against the page as it really is, so a page whose size
            # differs from the one marked still receives the rubric in the right
            # relative spot.
            page_width=largura_pagina,
            page_height=altura_pagina,
        )
        c.drawImage(
            ImageReader(io.BytesIO(colocacao.rubrica)),
            x,
            y,
            width=largura,
            height=altura,
            mask="auto",  # respects PNG transparency
            preserveAspectRatio=True,
            anchor="sw",
        )

    c.showPage()
    c.save()
    buffer.seek(0)
    return PdfReader(buffer)


def _conference_page(
    largura: float, altura: float, colocacoes: list[SignaturePlacement], documento: str
) -> PdfReader:
    """A final page listing who signed, when, and which version they signed."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(largura, altura))

    c.setFont("Helvetica-Bold", 13)
    c.drawString(20 * mm, altura - 25 * mm, "Folha de conferência de assinaturas")
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, altura - 32 * mm, f"Documento: {documento}")

    y = altura - 45 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Signatário")
    c.drawString(80 * mm, y, "Data e hora")
    c.drawString(140 * mm, y, "Versão")

    c.setFont("Helvetica", 9)
    for colocacao in sorted(colocacoes, key=lambda p: p.assinado_em):
        y -= 7 * mm
        if y < 20 * mm:  # nunca escreve fora da página
            break
        c.drawString(20 * mm, y, colocacao.signatario[:30])
        c.drawString(
            80 * mm, y, colocacao.assinado_em.strftime("%d/%m/%Y %H:%M:%S %Z").strip()
        )
        c.drawString(140 * mm, y, f"v{colocacao.versao}")

    c.setFont("Helvetica-Oblique", 8)
    c.drawString(
        20 * mm,
        15 * mm,
        "Assinaturas eletrônicas registradas no GED DGE, confirmadas por senha do signatário.",
    )
    c.showPage()
    c.save()
    buffer.seek(0)
    return PdfReader(buffer)


def stamp_pdf(
    original: bytes, colocacoes: list[SignaturePlacement], *, documento: str
) -> bytes:
    """Return a copy of `original` with the rubrics drawn and a conference page.

    `original` is never modified: the bytes in storage stay as uploaded, and this
    result is regenerated whenever it is asked for.
    """
    if not colocacoes:
        # Nothing to add: hand back exactly what was stored, byte for byte.
        return original

    reader = PdfReader(io.BytesIO(original))
    writer = PdfWriter()

    por_pagina: dict[int, list[SignaturePlacement]] = {}
    for colocacao in colocacoes:
        por_pagina.setdefault(colocacao.pagina, []).append(colocacao)

    for indice, pagina in enumerate(reader.pages, start=1):
        # Each page keeps its own dimensions, which is what makes a file mixing page
        # sizes come out right.
        caixa = pagina.mediabox
        largura = float(caixa.width)
        altura = float(caixa.height)

        do_pagina = por_pagina.get(indice)
        if do_pagina:
            overlay = _overlay_for_page(largura, altura, do_pagina)
            pagina.merge_page(overlay.pages[0])
        writer.add_page(pagina)

    # The conference page takes the size of the first page when there is one, so it
    # prints on the same paper as the rest.
    if len(reader.pages) > 0:
        primeira = reader.pages[0].mediabox
        tamanho = (float(primeira.width), float(primeira.height))
    else:
        tamanho = A4
    writer.add_page(_conference_page(tamanho[0], tamanho[1], colocacoes, documento).pages[0])

    saida = io.BytesIO()
    writer.write(saida)
    return saida.getvalue()


class UnreadablePdf(Exception):
    """The stored bytes are not a PDF this library can parse."""


def page_count(pdf: bytes) -> int:
    """How many pages a PDF has — used to refuse marking a page that does not exist.

    A file that says it is a PDF but cannot be parsed is a client-visible problem,
    not a server crash, so the caller turns this into a 400.
    """
    try:
        return len(PdfReader(io.BytesIO(pdf)).pages)
    except Exception as exc:  # pypdf raises a variety of low-level errors
        raise UnreadablePdf(str(exc)) from exc
