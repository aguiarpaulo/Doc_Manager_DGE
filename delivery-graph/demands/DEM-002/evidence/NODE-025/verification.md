# NODE-025 Verification

Node: Remocao do Streamlit apos paridade comprovada
Verified: 2026-08-16T00:09:46.672Z

## Required evidence

- streamlit_app/ e tests/test_streamlit_ui.py deixam de existir: satisfied
  - EVD-001 [manual]: Ambos removidos, junto com .streamlit/ (tema) e scripts/smoke_streamlit_ui.py. Antes da remocao foi feita auditoria de paridade endpoint a endpoint: 20 de 21 funcoes do api_client tem contrapartida na SPA e a 21a (history) nunca era renderizada por nenhuma tela.
    - Artifact: artifacts/EVD-001-PROOF-matriz-de-paridade.txt
- O extra ui e as dependencias de streamlit saem do pyproject.toml e do lockfile: satisfied
  - EVD-002 [manual]: Extra [project.optional-dependencies].ui removido por inteiro e streamlit[pdf] retirado do grupo dev. requests tambem saiu: era usado apenas pelo cliente Streamlit. uv sync desinstalou streamlit 1.58.0, streamlit-pdf 2.0.1 e dependencias transitivas; 0 ocorrencias de streamlit no uv.lock.
    - Artifact: artifacts/EVD-002-PROOF-remocao-verificada.txt
- README CLAUDE.md e scripts nao instruem mais a rodar a UI Streamlit: satisfied
  - EVD-003 [manual]: README: 0 mencoes; secao de execucao substituida pelos comandos do frontend e o snippet de cadastro de obras reescrito com urllib em vez de requests+api_client. CLAUDE.md: bloco Streamlit UI substituido pela descricao da SPA (fronteira unica, taxonomia de erro por category, RemoteState, armazenamento de sessao, as duas camadas de teste) e limitacoes obsoletas trocadas pelas reais.
    - Artifact: artifacts/EVD-003-PROOF-remocao-verificada.txt
- scripts/smoke_streamlit_ui.py e substituido ou removido conforme a SPA: satisfied
  - EVD-004 [manual]: Removido. O papel dele passa a ser cumprido por src/data/*.integration.test.ts (fronteira real contra API real, ativado por GED_LIVE_API=1) e pelo smoke de docker compose registrado no NODE-024. Ambos documentados no README no lugar do script antigo.
    - Artifact: artifacts/EVD-004-PROOF-remocao-verificada.txt
- pytest e ruff check passam integralmente apos a remocao: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest passed
    - Artifact: artifacts/EVD-005-command.json
  - EVD-006 [command]: .venv/Scripts/python.exe -m ruff check . passed
    - Artifact: artifacts/EVD-006-command.json
