# NODE-033 Verification

Node: Carimbo do PDF sob demanda com pypdf e reportlab: rubricas nas areas marcadas + pagina de conferencia + original intocado
Verified: 2026-08-19T13:58:41.812Z

## Required evidence

- Baixar documento assinado retorna PDF com a rubrica na pagina e coordenadas registradas: satisfied
  - EVD-001 [command]: .venv/Scripts/python.exe -m pytest tests/test_pdf_stamp.py -q -k downloading_a_signed or rubric_is_drawn_on_the_marked_page or several_signatures passed
    - Artifact: artifacts/EVD-001-command.json
- O PDF traz pagina final de conferencia com nome horario e versao de cada signatario: satisfied
  - EVD-002 [command]: .venv/Scripts/python.exe -m pytest tests/test_pdf_stamp.py -q -k conference_page or adds_a_conference passed
    - Artifact: artifacts/EVD-002-command.json
- O hash SHA-256 do objeto original no armazenamento e identico antes e depois da assinatura: satisfied
  - EVD-003 [command]: .venv/Scripts/python.exe -m pytest tests/test_pdf_stamp.py -q -k stored_object_and_its_hash passed
    - Artifact: artifacts/EVD-003-command.json
- Documento sem assinatura baixa o arquivo original byte a byte sem alteracao: satisfied
  - EVD-004 [command]: .venv/Scripts/python.exe -m pytest tests/test_pdf_stamp.py -q -k unsigned_document_downloads or without_signatures_the_bytes passed
    - Artifact: artifacts/EVD-004-command.json
- Gerar o carimbo nao cria nova versao nem altera o status de aprovacao do documento: satisfied
  - EVD-005 [command]: .venv/Scripts/python.exe -m pytest tests/test_pdf_stamp.py -q -k creates_no_version passed
    - Artifact: artifacts/EVD-005-command.json
- A conversao de origem superior esquerda para a origem inferior esquerda do PDF posiciona corretamente em documento com paginas de tamanhos diferentes: satisfied
  - EVD-006 [command]: .venv/Scripts/python.exe -m pytest tests/test_pdf_stamp.py -q -k flipped_exactly_once or rectangle_at_the_bottom or each_pages_own_dimensions or never_leaves_the_page or mixed_page_sizes passed
    - Artifact: artifacts/EVD-006-command.json
- Nenhum binario nativo e adicionado ao container (pypdf e reportlab sao Python puro): satisfied
  - EVD-007 [command]: .venv/Scripts/python.exe -m pytest tests/test_container_build.py -q passed
    - Artifact: artifacts/EVD-007-command.json
