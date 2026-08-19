# NODE-027 Verification

Node: Solicitacao de assinatura: modelo + API com vinculo a versao pagina e coordenadas normalizadas
Verified: 2026-08-19T12:28:45.477Z

## Required evidence

- Criar solicitacao vincula a versao atual do documento e grava pagina + coordenadas normalizadas de 0 a 1 com origem no canto superior esquerdo: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_requests.py -q -k binds_to_the_current_version or area_outside or page_number_is_one_based passed
    - Artifact: artifacts/EVD-001-command.json
- page_width e page_height em pontos sao gravados no ato da marcacao para tratar PDFs com paginas de tamanhos diferentes: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_requests.py -q -k page_size_in_points passed
    - Artifact: artifacts/EVD-002-command.json
- Indicar signatario sem acesso a obra do documento retorna 403 (o escopo de app/scope.py e aplicado na consulta e nao so no roteador): satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_requests.py -q -k outside_the_obra or diretor_may_be_asked or unknown_or_inactive passed
    - Artifact: artifacts/EVD-003-command.json
- Documento cujo content type nao e PDF recusa a criacao de solicitacao: satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_requests.py -q -k non_pdf or without_a_file passed
    - Artifact: artifacts/EVD-004-command.json
- Um mesmo documento aceita varias solicitacoes para signatarios diferentes sem ordem obrigatoria entre elas: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_requests.py -q -k several_signatories or second_pending passed
    - Artifact: artifacts/EVD-005-command.json
- Somente criador do documento administrador ou diretor podem solicitar assinatura: satisfied
  - EVD-006 [command]: .venv/Scripts/python.exe -m pytest tests/test_signature_requests.py -q -k author_may_request or administrador_and_diretor or colleague_who_did_not or outside_the_obra_cannot_even_see passed
    - Artifact: artifacts/EVD-006-command.json
