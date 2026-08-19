import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Obra, Usuario } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { AuthProvider } from "../auth/AuthContext.tsx";
import { AdminPage } from "./AdminPage.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

const ADMIN: Usuario = {
  id: "u-admin",
  username: "admin",
  email: "a@e.com",
  role: "administrador",
  is_active: true,
  has_signature: true,
};

const ENGENHEIRO: Usuario = {
  id: "u-eng",
  username: "paulo",
  email: "p@e.com",
  role: "engenheiro",
  is_active: true,
  has_signature: true,
};

const OBRA: Obra = { id: "o-1", nome: "Aurora", descricao: null, is_deleted: false };
const ARQUIVADA: Obra = { id: "o-2", nome: "Bosque", descricao: null, is_deleted: true };

function Arvore() {
  return (
    <MemoryRouter initialEntries={["/administracao"]}>
      <AuthProvider>
        <Routes>
          <Route path="/administracao" element={<AdminPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

function comSessao(usuario: Usuario) {
  window.sessionStorage.setItem("ged.sessao.refresh", "r");
  vi.mocked(api.refresh).mockResolvedValue({ access_token: "a" });
  vi.mocked(api.me).mockResolvedValue(usuario);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.mocked(api.listarUsuarios).mockResolvedValue([ADMIN, ENGENHEIRO]);
  vi.mocked(api.listarObras).mockImplementation((_s?: AbortSignal, arquivadas = false) =>
    Promise.resolve(arquivadas ? [OBRA, ARQUIVADA] : [OBRA]),
  );
});

describe("acesso a area administrativa", () => {
  it("so se abre para papel administrador, conforme /auth/me", async () => {
    comSessao(ENGENHEIRO);
    render(<Arvore />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/restrita a administradores/);
    expect(screen.queryByRole("heading", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("abre para administrador", async () => {
    comSessao(ADMIN);
    render(<Arvore />);

    expect(
      await screen.findByRole("heading", { name: "Usuarios" }),
    ).toBeInTheDocument();
  });
});

describe("instalacao sem obras", () => {
  it("continua utilizavel com zero obras cadastradas", async () => {
    comSessao(ADMIN);
    vi.mocked(api.listarObras).mockResolvedValue([]);
    render(<Arvore />);

    // O bloco de criar a primeira obra precisa existir justamente aqui.
    expect(
      await screen.findByRole("button", { name: "Criar obra" }),
    ).toBeInTheDocument();
    // E a gestao de usuarios nao depende de existir obra.
    expect(screen.getByRole("heading", { name: "Usuarios" })).toBeInTheDocument();
  });

  it("permite restaurar a obra arquivada mesmo quando era a unica do sistema", async () => {
    comSessao(ADMIN);
    // Nenhuma obra ativa; a unica existente esta arquivada.
    vi.mocked(api.listarObras).mockImplementation(
      (_s?: AbortSignal, arquivadas = false) =>
        Promise.resolve(arquivadas ? [ARQUIVADA] : []),
    );
    vi.mocked(api.restaurarObra).mockResolvedValue({ ...ARQUIVADA, is_deleted: false });
    render(<Arvore />);

    const botao = await screen.findByRole("button", { name: "Restaurar Bosque" });
    await userEvent.setup().click(botao);

    await waitFor(() => {
      expect(api.restaurarObra).toHaveBeenCalledWith("o-2");
    });
  });
});

describe("gestao de usuarios", () => {
  it("o rotulo do botao acompanha a situacao do usuario sem novo envio", async () => {
    comSessao(ADMIN);
    render(<Arvore />);

    const tabela = await screen.findByRole("table", { name: "Usuarios cadastrados" });
    // Usuario ativo -> a acao oferecida e desativar.
    expect(
      within(tabela).getByRole("button", { name: "Desativar paulo" }),
    ).toBeInTheDocument();

    // Depois da mudanca, a lista recarrega com o novo estado e o rotulo inverte.
    vi.mocked(api.atualizarUsuario).mockResolvedValue({
      ...ENGENHEIRO,
      is_active: false,
    });
    vi.mocked(api.listarUsuarios).mockResolvedValue([
      ADMIN,
      { ...ENGENHEIRO, is_active: false },
    ]);

    await userEvent
      .setup()
      .click(within(tabela).getByRole("button", { name: "Desativar paulo" }));

    expect(
      await screen.findByRole("button", { name: "Ativar paulo" }),
    ).toBeInTheDocument();
    expect(api.atualizarUsuario).toHaveBeenCalledWith("u-eng", { is_active: false });
  });

  it("explica o motivo quando o servidor recusa auto-rebaixamento", async () => {
    comSessao(ADMIN);
    // O 403 e do servidor (app/api/users.py); a UI apenas o exibe.
    vi.mocked(api.atualizarUsuario).mockRejectedValue(
      new ApplicationError(
        "Não é permitido reduzir os próprios privilégios",
        "autorizacao",
        403,
      ),
    );
    render(<Arvore />);

    const tabela = await screen.findByRole("table", { name: "Usuarios cadastrados" });
    await userEvent
      .setup()
      .click(within(tabela).getByRole("button", { name: "Desativar admin" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não é permitido reduzir os próprios privilégios",
    );
  });

  it("marca qual linha e a do proprio administrador", async () => {
    comSessao(ADMIN);
    render(<Arvore />);

    const tabela = await screen.findByRole("table", { name: "Usuarios cadastrados" });
    expect(within(tabela).getByText("(voce)")).toBeInTheDocument();
  });

  it("da nome acessivel ao seletor de papel de cada linha", async () => {
    comSessao(ADMIN);
    render(<Arvore />);

    // Dentro de tabela o cabecalho da coluna nao basta como nome acessivel.
    expect(await screen.findByLabelText("Papel de paulo")).toBeInTheDocument();
    expect(screen.getByLabelText("Papel de admin")).toBeInTheDocument();
  });
});

describe("acesso as obras", () => {
  it("concede e remove acesso de um usuario a uma obra", async () => {
    comSessao(ADMIN);
    vi.mocked(api.atribuirUsuarioAObra).mockResolvedValue(undefined);
    vi.mocked(api.removerUsuarioDaObra).mockResolvedValue(undefined);
    render(<Arvore />);

    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Acesso as obras" });
    await user.selectOptions(screen.getByLabelText("Usuario", { selector: "#acesso-usuario" }), "u-eng");
    await user.selectOptions(screen.getByLabelText("Obra"), "o-1");

    await user.click(screen.getByRole("button", { name: "Conceder acesso" }));
    await waitFor(() => {
      expect(api.atribuirUsuarioAObra).toHaveBeenCalledWith("o-1", "u-eng");
    });

    await user.click(screen.getByRole("button", { name: "Remover acesso" }));
    await waitFor(() => {
      expect(api.removerUsuarioDaObra).toHaveBeenCalledWith("o-1", "u-eng");
    });
  });

  it("explica que e preciso ter obra antes de atribuir acesso", async () => {
    comSessao(ADMIN);
    vi.mocked(api.listarObras).mockResolvedValue([]);
    render(<Arvore />);

    expect(
      await screen.findByText("Crie uma obra para poder atribuir acessos."),
    ).toBeInTheDocument();
  });
});

describe("criacao de usuario", () => {
  it("recusa quando a confirmacao de senha nao confere", async () => {
    comSessao(ADMIN);
    render(<Arvore />);

    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Usuarios" });
    await user.type(screen.getByLabelText("Usuario", { selector: "#novo-username" }), "novo");
    await user.type(screen.getByLabelText("E-mail"), "novo@exemplo.com");
    await user.type(screen.getByLabelText("Senha", { selector: "#nova-senha" }), "senha-correta-123");
    await user.type(screen.getByLabelText("Confirmar senha"), "senha-diferente-123");
    await user.click(screen.getByRole("button", { name: "Criar usuario" }));

    // Sem isso, um erro de digitacao cria um usuario que nunca consegue entrar.
    expect(await screen.findByRole("alert")).toHaveTextContent(/nao conferem/);
    expect(api.criarUsuario).not.toHaveBeenCalled();
  });

  it("cria o usuario quando as senhas conferem", async () => {
    comSessao(ADMIN);
    vi.mocked(api.criarUsuario).mockResolvedValue(ENGENHEIRO);
    render(<Arvore />);

    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Usuarios" });
    await user.type(screen.getByLabelText("Usuario", { selector: "#novo-username" }), "novo");
    await user.type(screen.getByLabelText("E-mail"), "novo@exemplo.com");
    await user.type(screen.getByLabelText("Senha", { selector: "#nova-senha" }), "senha-correta-123");
    await user.type(screen.getByLabelText("Confirmar senha"), "senha-correta-123");
    await user.click(screen.getByRole("button", { name: "Criar usuario" }));

    await waitFor(() => {
      expect(api.criarUsuario).toHaveBeenCalledWith({
        username: "novo",
        email: "novo@exemplo.com",
        password: "senha-correta-123",
        role: "engenheiro",
      });
    });
  });

  it("exibe a regra de nome de usuario junto ao campo", async () => {
    comSessao(ADMIN);
    render(<Arvore />);

    const campo = await screen.findByLabelText("Usuario", { selector: "#novo-username" });
    expect(campo).toHaveAccessibleDescription(/3 a 32 caracteres/);
  });
});
