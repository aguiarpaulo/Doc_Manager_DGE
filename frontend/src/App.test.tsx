import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Obra, ResumoObra, Usuario } from "./data/contracts.ts";
import { ApplicationError } from "./data/errors.ts";
import { AuthProvider } from "./features/auth/AuthContext.tsx";
import { Rotas } from "./App.tsx";

vi.mock("./data/api.ts");
const api = await import("./data/api.ts");

const USUARIO: Usuario = {
  id: "u-1",
  username: "paulo",
  email: "p@e.com",
  role: "engenheiro",
  is_active: true,
  has_signature: true,
};

const OBRA: Obra = { id: "o-1", nome: "Residencial Aurora", descricao: null, is_deleted: false };

const RESUMO: ResumoObra[] = [
  {
    obra: OBRA,
    total_documents: 1,
    by_status: { enviado: 1, em_analise: 0, aprovado: 0, rejeitado: 0 },
    latest_activity: null,
  },
];

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
        screen.getByRole("heading", { level: 1, name: "Gerenciador de Documentos" }),
      ).toBeInTheDocument();
    });
  });

  it("leva ao painel inicial quando autenticado, em vez de redirecionar para a primeira obra", async () => {
    window.sessionStorage.setItem("ged.sessao.refresh", "r");
    vi.mocked(api.refresh).mockResolvedValue({ access_token: "a" });
    vi.mocked(api.me).mockResolvedValue(USUARIO);
    // Existe obra disponivel: o comportamento antigo (EscolherObra) teria
    // redirecionado direto para ela. Este teste so prova algo porque ha pelo
    // menos uma obra — com a lista vazia, o estado "sem obras" seria identico
    // ao do redirecionador antigo e nao provaria nada sobre a mudanca.
    vi.mocked(api.resumoObras).mockResolvedValue(RESUMO);
    vi.mocked(api.minhasPendencias).mockResolvedValue([]);

    render(<Arvore inicial="/" />);

    expect(
      await screen.findByRole("link", { name: /Residencial Aurora/ }),
    ).toBeInTheDocument();
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
