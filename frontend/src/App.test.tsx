import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "./data/errors.ts";
import { AuthProvider } from "./features/auth/AuthContext.tsx";
import { Rotas } from "./App.tsx";

vi.mock("./data/api.ts");
const api = await import("./data/api.ts");

function Arvore({ inicial }: { inicial: string }) {
  return (
    <MemoryRouter initialEntries={[inicial]}>
      <AuthProvider>
        <Rotas />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(api.refresh).mockRejectedValue(
    new ApplicationError("sem sessao", "autenticacao"),
  );
});

describe("rotas da aplicacao", () => {
  it("apresenta o titulo da aplicacao como cabecalho acessivel no login", async () => {
    render(<Arvore inicial="/entrar" />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "GED DGE" }),
      ).toBeInTheDocument();
    });
  });

  it("oferece uma experiencia intencional de rota desconhecida", async () => {
    render(<Arvore inicial="/rota-que-nao-existe" />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Pagina nao encontrada" }),
      ).toBeInTheDocument();
    });
  });

  it("permite chegar a recuperacao de senha sem sessao", async () => {
    render(<Arvore inicial="/esqueci-minha-senha" />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Recuperar senha" }),
      ).toBeInTheDocument();
    });
  });
});
