# NODE-025 — Remoção do Streamlit

**Demanda:** DEM-002 · **Track:** TRK-release · **Requisito:** REQ-031
**Depende de:** NODE-024 (`done`) · **Contrato: 5/5**

## Fase 1 concluída

A SPA substituiu o Streamlit por completo. `pytest`: **105 passando**.
`ruff check .`: limpo. Frontend: **97 testes** + 24 de integração ao vivo.

## A auditoria veio antes da remoção

Aplicando a lição do NODE-023 — contrato satisfeito não é requisito satisfeito —
enumerei **toda** a superfície que a UI Streamlit usava (as 21 funções de
`api_client.py`, que são os endpoints que ela de fato chamava) e conferi uma a
uma contra a SPA.

**20 de 21 com paridade.** A 21ª (`history`) existia no cliente mas
`grep -n history streamlit_app/app.py` não retornava nada: nenhuma tela a
chamava. Não era lacuna.

**Duas lacunas reais apareceram e foram fechadas antes de remover:**

| Lacuna | Origem | Fechamento |
|---|---|---|
| Confirmação de senha ao criar usuário | commit `4aee7d9`, proposital | Campo + validação + 2 testes |
| Regra de nome de usuário exibida | `st.caption(REGRA_USUARIO)` | `aria-describedby` do campo |

Sem a confirmação, um erro de digitação cria um usuário que nunca consegue
entrar e só um administrador pode corrigir. Era uma proteção real, não enfeite.

## A identidade visual foi migrada, não descartada

`.streamlit/config.toml` guardava decisões deliberadas de design: acento
institucional único `#15497b` com 7:1 de contraste sobre branco, cinzas neutros,
corpo de 15px para caber mais itens na lista, cantos retos com bordas fazendo o
trabalho estrutural, e cores de status que **diferem em luminosidade** para
continuarem distinguíveis em escala de cinza ou para quem tem daltonismo
vermelho-verde.

Removê-lo sem transportar isso perderia o commit inteiro que o criou. Os valores
viraram tokens semânticos em `frontend/src/styles/index.css` antes da remoção,
com os comentários explicando o porquê de cada um. Zero cores literais fora
desse arquivo.

## Uma regressão minha que este nó pegou

`test_https_gap_resolution_matches_caddy_implementation` quebrou: o NODE-024
renomeou o serviço `caddy` para `web` e moveu o Caddy para
`docker/Dockerfile.web`, e **eu não rodei o `pytest` naquele nó** — só a suíte do
frontend.

O teste estava certo; minha mudança é que tornou obsoleta a descrição. Corrigi os
dois lados: o teste agora confere onde o Caddy realmente vive (e que
`handle_path /api/*` existe), e a resolução do GAP-002 foi reescrita para
descrever a implementação atual de origem única.

**Lição operacional:** um nó que mexe em infraestrutura precisa rodar a suíte do
backend, não só a do lado que ele parece tocar.

## Contrato — 5/5

| # | Item | Evidência |
|---|---|---|
| 1 | `streamlit_app/` e `tests/test_streamlit_ui.py` removidos | EVD-001 |
| 2 | Extra `ui` e streamlit fora do pyproject e do lockfile | EVD-002 |
| 3 | README e CLAUDE.md não instruem mais o Streamlit | EVD-003 |
| 4 | `smoke_streamlit_ui.py` substituído | EVD-004 |
| 5 | `pytest` e `ruff` passam | EVD-005, EVD-006 |

`requests` também saiu: era usado exclusivamente pelo cliente Streamlit. O
snippet do README que dependia dele foi reescrito com `urllib` da biblioteca
padrão.

O papel do `smoke_streamlit_ui.py` passou para dois lugares, ambos sem mock:
`src/data/*.integration.test.ts` (fronteira real contra API real) e o smoke de
`docker compose` do NODE-024.

## Limitações conhecidas

- **Ainda não há E2E em navegador.** As integrações dirigem a fronteira de dados,
  não pixels nem teclado. É o NODE-040.
- **O `.env` do repositório continua desatualizado** (pendência levantada no
  NODE-024, ação do operador).
- Sem medição de cobertura, nos dois lados.
