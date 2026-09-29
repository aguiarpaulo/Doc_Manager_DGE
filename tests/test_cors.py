"""CORS: desligado por padrão, ligado sob demanda para o servidor de desenvolvimento.

Em produção a SPA e a API compartilham origem — o Caddy serve as duas — então
nenhum cabeçalho de CORS é necessário e liberar origem à toa só amplia a
superfície. Mas o fluxo de desenvolvimento documentado no README roda o Vite em
`localhost:5173` contra a API em outra porta, e sem CORS **nenhuma requisição
passa**: o navegador barra no preflight e a tela de login mostra falha de rede.

Esta suíte fixa as duas metades: o padrão continua fechado, e a abertura é
explícita, por origem nomeada, via `GED_CORS_ORIGINS`.

As asserções usam preflight (`OPTIONS`) e `/auth/me` sem credencial. Ambos são
respondidos sem tocar em banco ou MinIO — `/health` faria conexão real e deixaria
a suíte lenta e dependente de serviço externo.
"""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app

DEV = "http://localhost:5173"


@pytest.fixture
def app_com_origens(monkeypatch: pytest.MonkeyPatch):
    """Constrói a app com origens permitidas, restaurando o cache global depois."""
    construidos: list[None] = []

    def construir(origens: str | None) -> TestClient:
        if origens is None:
            monkeypatch.delenv("GED_CORS_ORIGINS", raising=False)
        else:
            monkeypatch.setenv("GED_CORS_ORIGINS", origens)
        get_settings.cache_clear()
        construidos.append(None)
        return TestClient(create_app())

    yield construir
    get_settings.cache_clear()


def preflight(cliente: TestClient, rota: str, metodo: str, cabecalho: str, origem: str):
    return cliente.options(
        rota,
        headers={
            "Origin": origem,
            "Access-Control-Request-Method": metodo,
            "Access-Control-Request-Headers": cabecalho,
        },
    )


def test_o_padrao_e_fechado() -> None:
    """Produção é mesma origem: sem configuração, nenhuma origem é liberada."""
    assert Settings(_env_file=None).cors_origins == []


def test_sem_a_variavel_a_app_nao_devolve_cabecalho_de_cors(app_com_origens) -> None:
    cliente = app_com_origens(None)

    resposta = cliente.get("/auth/me", headers={"Origin": DEV})

    assert resposta.headers.get("access-control-allow-origin") is None


def test_preflight_do_login_e_aceito(app_com_origens) -> None:
    """O caso que quebrava: POST com JSON dispara preflight antes do login."""
    cliente = app_com_origens(DEV)

    resposta = preflight(cliente, "/auth/login", "POST", "content-type", DEV)

    assert resposta.status_code == 200
    assert resposta.headers.get("access-control-allow-origin") == DEV


def test_o_cabecalho_authorization_e_autorizado(app_com_origens) -> None:
    """O token viaja em Authorization; sem liberá-lo o preflight barra tudo."""
    cliente = app_com_origens(DEV)

    resposta = preflight(cliente, "/auth/me", "GET", "authorization", DEV)

    assert resposta.status_code == 200
    assert "authorization" in resposta.headers.get("access-control-allow-headers", "").lower()


def test_resposta_simples_tambem_traz_a_permissao(app_com_origens) -> None:
    cliente = app_com_origens(DEV)

    resposta = cliente.get("/auth/me", headers={"Origin": DEV})

    # 401 porque não há credencial — o que importa aqui é o cabeçalho de CORS,
    # que o middleware acrescenta a qualquer resposta da origem permitida.
    assert resposta.status_code == 401
    assert resposta.headers.get("access-control-allow-origin") == DEV


def test_origem_nao_listada_nao_recebe_permissao(app_com_origens) -> None:
    cliente = app_com_origens(DEV)

    resposta = cliente.get("/auth/me", headers={"Origin": "http://intruso.example.com"})

    # A resposta existe — CORS é regra de navegador, não de servidor — mas sem o
    # cabeçalho que autoriza a leitura, que é o que barra o site de terceiros.
    assert resposta.headers.get("access-control-allow-origin") is None


def test_varias_origens_separadas_por_virgula(app_com_origens) -> None:
    outra = "http://127.0.0.1:5173"
    cliente = app_com_origens(f"{DEV}, {outra}")

    for origem in (DEV, outra):
        resposta = cliente.get("/auth/me", headers={"Origin": origem})
        assert resposta.headers.get("access-control-allow-origin") == origem


def test_espacos_em_volta_das_origens_sao_ignorados() -> None:
    """Uma variável de ambiente escrita à mão quase sempre vem com espaços."""
    lidas = Settings(_env_file=None, cors_origins="  http://a.test ,http://b.test  ")
    assert lidas.cors_origins == ["http://a.test", "http://b.test"]


def test_valor_vazio_nao_vira_origem_em_branco() -> None:
    """`GED_CORS_ORIGINS=` não pode virar uma origem chamada string vazia."""
    assert Settings(_env_file=None, cors_origins="").cors_origins == []
    assert Settings(_env_file=None, cors_origins=" , ").cors_origins == []
