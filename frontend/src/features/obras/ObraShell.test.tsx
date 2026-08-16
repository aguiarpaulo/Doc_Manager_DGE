import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Documento, Obra, Usuario } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { AuthProvider } from "../auth/AuthContext.tsx";
import { ObraShell, ordenarPorInclusao } from "./ObraShell.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

const USUARIO: Usuario = {
  id: "u-1",
  username: "paulo",
  email: "p@e.com",
  role: "engenheiro",
  is_active: true,
};

const OBRA: Obra = { id: "o-1", nome: "Residencial Aurora", descricao: null, is_deleted: false };

function doc(id: string, nome: string, criadoEm: string): Documento {
  return {
    id,
    nome,
    obra_id: "o-1",
    categoria: "contrato",
    status: "enviado",
    criado_por: "u-1",
    criado_em: criadoEm,
    current_version: 1,
  };
}

// Fora de ordem de proposito: a tela e que precisa ordenar.
const TRES_DOCUMENTOS = [
  doc("d-2", "ART do engenheiro", "2026-03-10T09:00:00Z"),
  doc("d-3", "Nota fiscal 043", "2026-05-22T15:30:00Z"),
  doc("d-1", "Contrato principal", "2026-01-05T10:00:00Z"),
];

function Arvore({ rota }: { rota: string }) {
  return (
    <MemoryRouter initialEntries={[rota]}>
      <AuthProvider>
        <Routes>
          <Route path="/obras/:obraId" element={<ObraShell />} />
          <Route path="/obras/:obraId/documentos/:documentoId" element={<ObraShell />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.sessionStorage.setItem("ged.sessao.refresh", "r");
  vi.mocked(api.refresh).mockResolvedValue({ access_token: "a" });
  vi.mocked(api.me).mockResolvedValue(USUARIO);
  vi.mocked(api.listarObras).mockResolvedValue([OBRA]);
  vi.mocked(api.listarDocumentos).mockResolvedValue(TRES_DOCUMENTOS);
  vi.mocked(api.obterDocumento).mockImplementation((id: string) =>
    Promise.resolve(TRES_DOCUMENTOS.find((d) => d.id === id) ?? TRES_DOCUMENTOS[0]!),
  );
  vi.mocked(api.baixarVersao).mockResolvedValue({
    blob: new Blob(["texto do documento"], { type: "text/plain" }),
    contentType: "text/plain",
  });
});

describe("ordenarPorInclusao", () => {
  it("coloca o mais antigo primeiro", () => {
    const ordenados = ordenarPorInclusao(TRES_DOCUMENTOS);
    expect(ordenados.map((d) => d.id)).toEqual(["d-1", "d-2", "d-3"]);
  });

  it("mantem ordem estavel quando as datas empatam", () => {
    const mesmaData = [
      doc("d-b", "B", "2026-01-01T00:00:00Z"),
      doc("d-a", "A", "2026-01-01T00:00:00Z"),
    ];
    expect(ordenarPorInclusao(mesmaData).map((d) => d.id)).toEqual(["d-a", "d-b"]);
  });

  it("nao muta a lista recebida", () => {
    const original = [...TRES_DOCUMENTOS];
    ordenarPorInclusao(TRES_DOCUMENTOS);
    expect(TRES_DOCUMENTOS).toEqual(original);
  });
});

describe("shell no modelo do SEI", () => {
  it("lista os documentos da obra em ordem de inclusao", async () => {
    render(<Arvore rota="/obras/o-1" />);

    const lista = await screen.findByRole("navigation", { name: "Documentos da obra" });
    await waitFor(() => {
      expect(within(lista).getAllByRole("listitem")).toHaveLength(3);
    });

    const itens = within(lista).getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("Contrato principal");
    expect(itens[1]).toHaveTextContent("ART do engenheiro");
    expect(itens[2]).toHaveTextContent("Nota fiscal 043");
  });

  it("renderiza o documento selecionado ao lado sem recarregar a pagina", async () => {
    const user = userEvent.setup();
    render(<Arvore rota="/obras/o-1" />);

    const lista = await screen.findByRole("navigation", { name: "Documentos da obra" });
    await waitFor(() => {
      expect(within(lista).getAllByRole("listitem")).toHaveLength(3);
    });

    // Antes da selecao, o painel convida a escolher.
    expect(screen.getByText(/Selecione um documento/)).toBeInTheDocument();

    await user.click(within(lista).getByRole("button", { name: /ART do engenheiro/ }));

    const painel = screen.getByRole("region", { name: "Documento selecionado" });
    await waitFor(() => {
      expect(within(painel).getByText("ART do engenheiro")).toBeInTheDocument();
    });

    // A lista continua montada: houve navegacao na SPA e nao recarga da pagina.
    expect(within(lista).getAllByRole("listitem")).toHaveLength(3);
  });

  it("marca na lista qual documento esta aberto", async () => {
    render(<Arvore rota="/obras/o-1/documentos/d-3" />);

    const lista = await screen.findByRole("navigation", { name: "Documentos da obra" });
    await waitFor(() => {
      expect(
        within(lista).getByRole("button", { name: /Nota fiscal 043/ }),
      ).toHaveAttribute("aria-current", "true");
    });
    expect(
      within(lista).getByRole("button", { name: /Contrato principal/ }),
    ).not.toHaveAttribute("aria-current");
  });

  it("restaura a mesma tela quando a rota ja aponta para um documento", async () => {
    // Equivale a recarregar o navegador em /obras/o-1/documentos/d-1.
    render(<Arvore rota="/obras/o-1/documentos/d-1" />);

    const painel = await screen.findByRole("region", { name: "Documento selecionado" });
    await waitFor(() => {
      expect(within(painel).getByText("Contrato principal")).toBeInTheDocument();
    });
    expect(api.obterDocumento).toHaveBeenCalledWith("d-1", expect.anything());
  });

  it("mostra estado vazio proprio quando a obra nao tem documentos", async () => {
    vi.mocked(api.listarDocumentos).mockResolvedValue([]);
    render(<Arvore rota="/obras/o-1" />);

    expect(await screen.findByText(/ainda nao tem documentos/)).toBeInTheDocument();
    // Vazio nao e erro: nada de alerta na tela.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("distingue falha de carregamento de lista vazia", async () => {
    vi.mocked(api.listarDocumentos).mockRejectedValue(
      new ApplicationError("Sem acesso a esta obra.", "autorizacao", 403),
    );
    render(<Arvore rota="/obras/o-1" />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Sem acesso a esta obra.");
    expect(screen.queryByText(/ainda nao tem documentos/)).not.toBeInTheDocument();
  });
});
