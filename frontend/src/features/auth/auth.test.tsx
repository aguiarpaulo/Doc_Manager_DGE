import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "../../data/errors.ts";
import type { Usuario } from "../../data/contracts.ts";
import { AuthProvider } from "./AuthContext.tsx";
import { LoginPage } from "./LoginPage.tsx";
import { RotaProtegida } from "./RotaProtegida.tsx";
import { lerAccessToken, limparSessao } from "./session.ts";

// A fronteira HTTP e simulada; nenhum teste deste arquivo toca a rede.
vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

const ENGENHEIRO: Usuario = {
  id: "u-1",
  username: "paulo",
  email: "paulo@exemplo.com",
  role: "engenheiro",
  is_active: true,
  has_signature: true,
};

const ADMIN: Usuario = { ...ENGENHEIRO, id: "u-2", username: "chefe", role: "administrador" };

function Protegida() {
  return <p>area protegida</p>;
}

function Arvore({ inicial = "/" }: { inicial?: string }) {
  return (
    <MemoryRouter initialEntries={[inicial]}>
      <AuthProvider>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />
          <Route element={<RotaProtegida />}>
            <Route path="/" element={<Protegida />} />
            <Route path="/obras/:id" element={<Protegida />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function preencherEEntrar(usuario: string, senha: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Usuario"), usuario);
  await user.type(screen.getByLabelText("Senha"), senha);
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

beforeEach(() => {
  limparSessao();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(api.refresh).mockRejectedValue(
    new ApplicationError("sem sessao", "autenticacao"),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("armazenamento da sessao", () => {
  it("guarda o refresh em sessionStorage e mantem o access apenas em memoria", async () => {
    vi.mocked(api.login).mockResolvedValue({
      access_token: "access-123",
      refresh_token: "refresh-456",
      token_type: "bearer",
    });
    vi.mocked(api.me).mockResolvedValue(ENGENHEIRO);

    render(<Arvore inicial="/entrar" />);
    await preencherEEntrar("paulo", "senha-correta");

    await waitFor(() => {
      expect(screen.getByText("area protegida")).toBeInTheDocument();
    });

    // O access token nunca vai para armazenamento do navegador.
    expect(window.localStorage.length).toBe(0);
    expect(JSON.stringify(window.sessionStorage)).not.toContain("access-123");
    expect(lerAccessToken()).toBe("access-123");

    // O refresh vai para sessionStorage (termina com a aba), nunca localStorage.
    expect(window.sessionStorage.getItem("ged.sessao.refresh")).toBe("refresh-456");
    expect(window.localStorage.getItem("ged.sessao.refresh")).toBeNull();
  });
});

describe("rota protegida", () => {
  it("manda ao login quem nao tem sessao", async () => {
    render(<Arvore inicial="/" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    });
    expect(screen.queryByText("area protegida")).not.toBeInTheDocument();
  });

  it("retorna ao destino original apos autenticar", async () => {
    vi.mocked(api.login).mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
    });
    vi.mocked(api.me).mockResolvedValue(ENGENHEIRO);

    // Este e o comportamento de que o link do e-mail de assinatura depende.
    render(<Arvore inicial="/obras/obra-99" />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    });

    await preencherEEntrar("paulo", "senha-correta");

    await waitFor(() => {
      expect(screen.getByText("area protegida")).toBeInTheDocument();
    });
  });

  it("nao decide nada enquanto a sessao esta sendo verificada", () => {
    window.sessionStorage.setItem("ged.sessao.refresh", "refresh-guardado");
    vi.mocked(api.refresh).mockReturnValue(new Promise(() => {}));

    render(<Arvore inicial="/" />);

    // Redirecionar aqui expulsaria o usuario a cada F5.
    expect(screen.getByRole("status")).toHaveTextContent("Verificando sessao");
    expect(screen.queryByRole("heading", { name: "Entrar" })).not.toBeInTheDocument();
  });
});

describe("papel do usuario", () => {
  it("vem de GET /auth/me e nao do token", async () => {
    vi.mocked(api.login).mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
    });
    vi.mocked(api.me).mockResolvedValue(ADMIN);

    render(<Arvore inicial="/entrar" />);
    await preencherEEntrar("chefe", "senha");

    await waitFor(() => {
      expect(screen.getByText("area protegida")).toBeInTheDocument();
    });
    // O papel so pode ter vindo de /auth/me: o JWT carrega sub/type/iat/exp.
    expect(api.me).toHaveBeenCalled();
  });
});

describe("refresh na montagem", () => {
  it("reconstroi a sessao a partir do refresh guardado sem passar pelo login", async () => {
    window.sessionStorage.setItem("ged.sessao.refresh", "refresh-valido");
    vi.mocked(api.refresh).mockResolvedValue({ access_token: "novo-access" });
    vi.mocked(api.me).mockResolvedValue(ENGENHEIRO);

    render(<Arvore inicial="/" />);

    await waitFor(() => {
      expect(screen.getByText("area protegida")).toBeInTheDocument();
    });
    expect(api.refresh).toHaveBeenCalledWith("refresh-valido");
    expect(lerAccessToken()).toBe("novo-access");
    expect(api.login).not.toHaveBeenCalled();
  });

  it("cai para anonimo quando o refresh guardado nao vale mais", async () => {
    window.sessionStorage.setItem("ged.sessao.refresh", "refresh-expirado");
    vi.mocked(api.refresh).mockRejectedValue(
      new ApplicationError("token expirado", "autenticacao"),
    );

    render(<Arvore inicial="/" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    });
    expect(window.sessionStorage.getItem("ged.sessao.refresh")).toBeNull();
  });
});

describe("credencial invalida", () => {
  it("mostra a mensagem da API sem revelar se o usuario existe", async () => {
    vi.mocked(api.login).mockRejectedValue(
      new ApplicationError("Credenciais invalidas", "autenticacao", 401),
    );

    render(<Arvore inicial="/entrar" />);
    await preencherEEntrar("paulo", "senha-errada");

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Credenciais invalidas");
    // A mensagem nao pode distinguir usuario inexistente de senha errada.
    expect(alerta.textContent ?? "").not.toMatch(/nao existe|inexistente|nao encontrado/i);
    expect(screen.queryByText("area protegida")).not.toBeInTheDocument();
  });

  it("mantem o usuario na tela de login apos a falha", async () => {
    vi.mocked(api.login).mockRejectedValue(
      new ApplicationError("Credenciais invalidas", "autenticacao", 401),
    );

    render(<Arvore inicial="/entrar" />);
    await preencherEEntrar("paulo", "errada");

    await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(lerAccessToken()).toBeNull();
  });

  it("limpa o erro anterior ao iniciar nova tentativa", async () => {
    vi.mocked(api.login).mockRejectedValueOnce(
      new ApplicationError("Credenciais invalidas", "autenticacao", 401),
    );
    vi.mocked(api.login).mockResolvedValueOnce({
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
    });
    vi.mocked(api.me).mockResolvedValue(ENGENHEIRO);

    render(<Arvore inicial="/entrar" />);
    await preencherEEntrar("paulo", "errada");
    await screen.findByRole("alert");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByText("area protegida")).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("nao deixa sessao pela metade quando /auth/me falha apos o login", async () => {
    vi.mocked(api.login).mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
    });
    vi.mocked(api.me).mockRejectedValue(
      new ApplicationError("Perfil indisponivel", "indisponivel", 503),
    );

    render(<Arvore inicial="/entrar" />);
    await preencherEEntrar("paulo", "senha");

    await screen.findByRole("alert");
    expect(lerAccessToken()).toBeNull();
    expect(window.sessionStorage.getItem("ged.sessao.refresh")).toBeNull();
  });
});
