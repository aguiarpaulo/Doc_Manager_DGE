# NODE-008 — Fluxo de aprovação

## O que foi implementado

- `app/api/documents.py` — endpoints do fluxo: `POST /documents/{id}/review` (Enviado→Em análise), `/approve` (Em análise→Aprovado), `/reject` (Em análise→Rejeitado).
  - `_require_approver`: apenas Administrador e Diretor movem o fluxo; Engenheiro/Financeiro → 403.
  - Bloqueio de self-approval: `criado_por == current_user` → 403 no `/approve`.
- Reusa `app/services/approval.py` (máquina de estados) — transições inválidas → 409.

## Contrato de validação (pytest)

1. **diretor/admin transitam para Em análise e Aprovado/Rejeitado; engenheiro/financeiro recebem 403** — `test_diretor_can_move_through_review_and_approve`, `test_admin_can_reject_after_review`, `test_engenheiro_and_financeiro_cannot_approve`.
2. **usuário não pode aprovar documento cujo criado_por é ele mesmo** — `test_cannot_approve_own_document` (Diretor cria, revisa, tenta aprovar → 403).
3. **transições inválidas de status são rejeitadas** — `test_invalid_transition_is_rejected` (aprovar documento Enviado sem passar por Em análise → 409).

Suite total: 36 passed, ruff limpo.
