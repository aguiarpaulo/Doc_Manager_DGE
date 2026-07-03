# NODE-010 — Busca de documentos (com escopo)

## O que foi implementado

- `app/api/documents.py` — `GET /documents` com filtros `nome` (ilike parcial), `categoria`, `obra_id`, `status`, `criado_por`. Exclui `is_deleted`. Escopo aplicado antes dos filtros: usuários não-globais só recebem documentos de obras atribuídas (mesmo filtrando por obra fora do escopo → vazio).
- `tests/test_search.py` — cobre os 3 itens do contrato.

## Contrato de validação (pytest)

1. **busca filtra por cada critério e combinações** — `test_search_filters_by_each_criterion_and_combinations` (nome, categoria, obra, categoria+obra, criado_por).
2. **resultados nunca incluem documentos fora do escopo** — `test_search_never_returns_out_of_scope_documents` (engenheiro não vê obra não atribuída, nem filtrando por ela).
3. **busca sem resultados retorna lista vazia (não erro)** — `test_search_with_no_results_returns_empty_list` (200 + []).

Suite total: 42 passed, ruff limpo.
