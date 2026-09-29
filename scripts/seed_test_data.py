"""Popula o stack de teste com um conjunto pequeno e previsível: 5 obras, 5
usuarios (alem do admin) e 2 documentos por obra. Existe so para preparar
dados de teste manual; nao faz parte da suite automatizada e nao e chamado
por nenhum outro codigo do projeto.
"""

import base64
import json
import urllib.request

BASE = "http://localhost:8080/api"
ADMIN = {"username": "admin", "password": "senha-de-teste-admin-e2e"}
SENHA_TESTE = "TesteSenha123!"

# PNG 1x1 transparente valido de verdade (nao so o content-type): assim o
# carimbo no PDF nao falha se alguem assinar de fato com esta rubrica.
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)

USUARIOS = [
    {"username": "engenheiro.um", "email": "engenheiro.um@exemplo.com", "role": "engenheiro"},
    {"username": "engenheiro.dois", "email": "engenheiro.dois@exemplo.com", "role": "engenheiro"},
    {"username": "diretor.um", "email": "diretor.um@exemplo.com", "role": "diretor"},
    {"username": "financeiro.um", "email": "financeiro.um@exemplo.com", "role": "financeiro"},
    {"username": "admin.dois", "email": "admin.dois@exemplo.com", "role": "administrador"},
]

OBRAS = [
    "Residencial Girassol",
    "Edificio Comercial Aurora",
    "Condominio Vista Verde",
    "Galpao Industrial Norte",
    "Reforma Sede Administrativa",
]


def chamar(caminho, corpo=None, token=None, metodo="POST", arquivo=None):
    cabecalhos = {}
    if token:
        cabecalhos["Authorization"] = f"Bearer {token}"
    if arquivo is not None:
        limite = "----seedboundary"
        campo, nome, conteudo, tipo = arquivo
        corpo_bytes = (
            f"--{limite}\r\n"
            f'Content-Disposition: form-data; name="{campo}"; filename="{nome}"\r\n'
            f"Content-Type: {tipo}\r\n\r\n"
        ).encode() + conteudo + f"\r\n--{limite}--\r\n".encode()
        cabecalhos["Content-Type"] = f"multipart/form-data; boundary={limite}"
        dados = corpo_bytes
    else:
        cabecalhos["Content-Type"] = "application/json"
        dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(f"{BASE}{caminho}", data=dados, headers=cabecalhos, method=metodo)
    with urllib.request.urlopen(req, timeout=30) as resp:
        corpo_resp = resp.read()
        return json.loads(corpo_resp) if corpo_resp else None


def pdf_simples(rotulo: str) -> bytes:
    objs = [
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R"
        "/Resources<</Font<</F1 5 0 R>>>>>>endobj",
        f"4 0 obj<</Length {len(rotulo) + 40}>>stream\n"
        f"BT /F1 18 Tf 72 760 Td ({rotulo}) Tj ET\nendstream endobj",
        "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    ]
    pdf = "%PDF-1.4\n"
    offsets = []
    for o in objs:
        offsets.append(len(pdf))
        pdf += o + "\n"
    inicio_xref = len(pdf)
    pdf += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n"
    for off in offsets:
        pdf += f"{off:010d} 00000 n \n"
    pdf += f"trailer<</Size {len(objs) + 1}/Root 1 0 R>>\nstartxref\n{inicio_xref}\n%%EOF\n"
    return pdf.encode("latin1")


def main():
    token = chamar("/auth/login", ADMIN)["access_token"]
    print("logado como admin")

    # Rubrica do admin, para nao bloquear quem entrar com essa conta.
    chamar(
        "/me/signature",
        token=token,
        metodo="PUT",
        arquivo=("file", "rubrica.png", PNG_1X1, "image/png"),
    )
    print("rubrica do admin registrada")

    criados = []
    for u in USUARIOS:
        usuario = chamar(
            "/users",
            {**u, "password": SENHA_TESTE},
            token,
        )
        criados.append(usuario)
        print(f"usuario criado: {usuario['username']} ({usuario['role']})")

    obras = []
    for nome in OBRAS:
        obra = chamar("/obras", {"nome": nome, "descricao": "Obra de teste"}, token)
        obras.append(obra)
        print(f"obra criada: {obra['nome']}")

    # Acesso: os dois engenheiros e o financeiro precisam de vinculo explicito
    # (administrador e diretor ja enxergam tudo). Concedido a todas as 5 obras,
    # para que nenhuma fique invisivel para quem for testar com essas contas.
    escopados = [u for u in criados if u["role"] in ("engenheiro", "financeiro")]
    for u in escopados:
        for obra in obras:
            chamar(f"/obras/{obra['id']}/users/{u['id']}", token=token, metodo="PUT")
    print(f"acesso concedido: {len(escopados)} usuarios x {len(obras)} obras")

    # 2 documentos por obra: um PDF real (mostra previa) e um Excel falso
    # (mesmo content-type que a API exige, conteudo arbitrario — mostra o
    # caminho de "sem previa, so download").
    primeiro_documento = None
    for obra in obras:
        pdf_doc = chamar(
            "/documents",
            {"nome": f"Contrato — {obra['nome']}", "obra_id": obra["id"], "categoria": "contrato"},
            token,
        )
        chamar(
            f"/documents/{pdf_doc['id']}/versions",
            token=token,
            arquivo=("file", "contrato.pdf", pdf_simples(obra["nome"]), "application/pdf"),
        )

        xlsx_doc = chamar(
            "/documents",
            {"nome": f"Planilha — {obra['nome']}", "obra_id": obra["id"], "categoria": "outros"},
            token,
        )
        chamar(
            f"/documents/{xlsx_doc['id']}/versions",
            token=token,
            arquivo=(
                "file",
                "planilha.xlsx",
                b"PK\x03\x04 conteudo de teste, nao e uma planilha real",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
        )
        print(f"2 documentos enviados em: {obra['nome']}")
        if primeiro_documento is None:
            primeiro_documento = (obra, pdf_doc)

    # Uma solicitacao de assinatura pendente, para que a conta de teste ja
    # tenha algo para assinar sem precisar montar o cenario na mao.
    obra_alvo, doc_alvo = primeiro_documento
    signatario = next(u for u in criados if u["username"] == "engenheiro.um")
    chamar(
        f"/documents/{doc_alvo['id']}/signature-requests",
        {
            "signatario_id": signatario["id"],
            "pagina": 1,
            "x": 0.15,
            "y": 0.6,
            "largura": 0.3,
            "altura": 0.1,
            "page_width": 595,
            "page_height": 842,
        },
        token,
    )
    print(f"solicitacao de assinatura pendente para engenheiro.um em: {obra_alvo['nome']}")

    print("\n--- resumo ---")
    print(
        f"obras: {len(obras)} | usuarios (alem do admin): {len(criados)} | "
        f"documentos: {len(obras) * 2}"
    )


if __name__ == "__main__":
    main()
