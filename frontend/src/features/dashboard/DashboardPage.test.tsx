import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Obra, PendenciaAssinatura, ResumoObra, Usuario } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { AuthProvider } from "../auth/AuthContext.tsx";
import { DashboardPage } from "./DashboardPage.tsx";

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

const OBRA_A: Obra = { id: "o-1", nome: "Residencial Aurora", descricao: null, is_deleted: false };
const OBRA_B: Obra = { id: "o-2", nome: "Galpao Industrial", descricao: null, is_deleted: false };

const RESUMO: ResumoObra[] = [
  {
    obra: OBRA_A,
    total_documents: 4,
    by_status: { enviado: 1, em_analise: 1, aprovado: 1, rejeitado: 1 },
    latest_activity: {
      action: "signed",
      actor_nome: "bruno",
      document_id: "d-1",
      document_nome: "Contrato principal",
      created_at: "2026-08-15T12:00:00Z",
    },
  },
  {
    obra: OBRA_B,
    total_documents: 0,
    by_status: { enviado: 0, em_analise: 0, aprovado: 0, rejeitado: 0 },
    latest_activity: null,
  },
];

function ObraAberta() {
  const { obraId } = useParams();
  return <p>Obra aberta: {obraId}</p>;
}

function Arvore({ rota = "/" }: { rota?: string }) {
  return (
    <MemoryRouter initialEntries={[rota]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/obras/:obraId" element={<ObraAberta />} />
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
  vi.mocked(api.resumoObras).mockResolvedValue(RESUMO);
  vi.mocked(api.minhasPendencias).mockResolvedValue([]);
});

describe("painel inicial", () => {
  it("lista um cartao por obra, com contagens e ultima atividade", async () => {
    render(<Arvore />);

    const cartaoA = await screen.findByRole("link", { name: /Residencial Aurora/ });
    expect(cartaoA).toHaveTextContent("bruno assinou");
    expect(cartaoA).toHaveTextContent("Contrato principal");
    // Uma contagem por status, nao apenas "algum numero" na obra.
    expect(cartaoA).toHaveTextContent("1 Enviado");
    expect(cartaoA).toHaveTextContent("1 Em análise");
    expect(cartaoA).toHaveTextContent("1 Aprovado");
    expect(cartaoA).toHaveTextContent("1 Rejeitado");

    const cartaoB = screen.getByRole("link", { name: /Galpao Industrial/ });
    expect(cartaoB).toHaveTextContent(/nenhuma atividade/i);
  });

  it("mostra o link de administracao so para administrador", async () => {
    vi.mocked(api.me).mockResolvedValue({ ...USUARIO, role: "engenheiro" });
    render(<Arvore />);

    await screen.findByRole("link", { name: /Residencial Aurora/ });
    expect(screen.queryByRole("link", { name: "Administração" })).not.toBeInTheDocument();
  });

  it("mostra o link de administracao para administrador", async () => {
    vi.mocked(api.me).mockResolvedValue({ ...USUARIO, role: "administrador" });
    render(<Arvore />);

    expect(
      await screen.findByRole("link", { name: "Administração" }),
    ).toBeInTheDocument();
  });

  it("mantem a ordem em que a API devolveu os resumos", async () => {
    render(<Arvore />);

    await screen.findByRole("link", { name: /Residencial Aurora/ });
    const nomes = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(nomes).toEqual(["Residencial Aurora", "Galpao Industrial"]);
  });

  it("navega para a obra ao clicar no cartao", async () => {
    const user = userEvent.setup();
    render(<Arvore />);

    const cartaoA = await screen.findByRole("link", { name: /Residencial Aurora/ });
    await user.click(cartaoA);

    expect(await screen.findByText("Obra aberta: o-1")).toBeInTheDocument();
  });

  it("mostra o que espera a assinatura do usuario, alem das obras", async () => {
    const pendencia: PendenciaAssinatura = {
      solicitacao: {
        id: "s-1",
        document_id: "d-9",
        document_version_id: "v-1",
        signatario_id: "u-1",
        solicitante_id: "u-2",
        pagina: 1,
        x: 0.1,
        y: 0.7,
        largura: 0.3,
        altura: 0.08,
        page_width: 595,
        page_height: 842,
        status: "pendente",
        motivo: null,
        criado_em: "2026-08-19T12:00:00Z",
        encerrado_em: null,
      },
      documento_nome: "Aditivo contratual",
    };
    vi.mocked(api.minhasPendencias).mockResolvedValue([pendencia]);

    render(<Arvore />);

    await screen.findByRole("link", { name: /Residencial Aurora/ });
    // Prova que o painel realmente renderiza o que MinhasPendencias devolve,
    // e nao so que a funcao foi chamada.
    expect(await screen.findByText("Aditivo contratual")).toBeInTheDocument();
  });

  it("mostra estado vazio proprio quando nao ha nenhuma obra acessivel", async () => {
    vi.mocked(api.resumoObras).mockResolvedValue([]);
    render(<Arvore />);

    expect(await screen.findByText(/Nenhuma obra cadastrada ainda/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("distingue falha de carregamento de lista vazia", async () => {
    vi.mocked(api.resumoObras).mockRejectedValue(
      new ApplicationError("Falha ao carregar obras.", "indisponivel"),
    );
    render(<Arvore />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Falha ao carregar obras.");
    expect(screen.queryByText(/Nenhuma obra cadastrada ainda/)).not.toBeInTheDocument();
  });

  it("permite tentar novamente apos uma falha", async () => {
    const user = userEvent.setup();
    vi.mocked(api.resumoObras).mockRejectedValueOnce(
      new ApplicationError("Falha ao carregar obras.", "indisponivel"),
    );
    render(<Arvore />);

    const alerta = await screen.findByRole("alert");
    await user.click(within(alerta).getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Residencial Aurora/ })).toBeInTheDocument();
    });
  });
});
