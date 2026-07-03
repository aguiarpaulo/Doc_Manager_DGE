"""Document approval state machine and per-version approval bookkeeping.

Pure domain transitions (no permission checks — those live in the API layer).
"""

from fastapi import HTTPException, status

from app.models.document import Document, DocumentStatus

# Allowed status transitions for the approval workflow.
ALLOWED_TRANSITIONS: dict[DocumentStatus, set[DocumentStatus]] = {
    DocumentStatus.ENVIADO: {DocumentStatus.EM_ANALISE},
    DocumentStatus.EM_ANALISE: {DocumentStatus.APROVADO, DocumentStatus.REJEITADO},
    DocumentStatus.APROVADO: set(),
    DocumentStatus.REJEITADO: set(),
}


def _ensure_transition(document: Document, new_status: DocumentStatus) -> None:
    if new_status not in ALLOWED_TRANSITIONS[document.status]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Transição inválida: {document.status} -> {new_status}",
        )


def start_review(document: Document) -> None:
    _ensure_transition(document, DocumentStatus.EM_ANALISE)
    document.status = DocumentStatus.EM_ANALISE


def approve(document: Document) -> None:
    """Approve the document's current version and record which version was approved."""
    _ensure_transition(document, DocumentStatus.APROVADO)
    document.status = DocumentStatus.APROVADO
    document.approved_version = document.current_version


def reject(document: Document) -> None:
    _ensure_transition(document, DocumentStatus.REJEITADO)
    document.status = DocumentStatus.REJEITADO


def reset_for_new_version(document: Document) -> None:
    """A newly uploaded version returns the document to Enviado, pending re-approval."""
    document.status = DocumentStatus.ENVIADO
    document.approved_version = None
