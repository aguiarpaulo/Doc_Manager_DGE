import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Usuario } from "../../data/contracts.ts";
import { AuthProvider } from "../../features/auth/AuthContext.tsx";
import { Cabecalho } from "./Cabecalho.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

const USUARIO: Usuario = {
  id: "u-1",
  username: "paulo",
  email: "p@e.com",
  role: "engenheiro",
  is_active: true,
  has_signature: true,
};

function renderizar() {
  return render(
    <MemoryRouter initialEntries={["/obras/o-1"]}>
      <AuthProvider>
        <Cabecalho />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Cabecalho", () => {
  it("a marca leva de volta ao painel inicial", async () => {
    window.sessionStorage.setItem("ged.sessao.refresh", "r");
    vi.mocked(api.refresh).mockResolvedValue({ access_token: "a" });
    vi.mocked(api.me).mockResolvedValue(USUARIO);

    renderizar();

    const marca = await screen.findByRole("link", { name: "Gerenciador de Documentos" });
    expect(marca).toHaveAttribute("href", "/");
    // Continua sendo um titulo de nivel 1, so que agora tambem navegavel.
    expect(screen.getByRole("heading", { level: 1 })).toContainElement(marca);
  });
});
