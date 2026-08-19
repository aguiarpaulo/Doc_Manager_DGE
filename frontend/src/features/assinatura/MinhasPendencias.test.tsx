import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PendenciaAssinatura, SolicitacaoAssinatura } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { MinhasPendencias } from "./MinhasPendencias.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

function solicitacao(id: string, documentId: string, pagina: number): SolicitacaoAssinatura {
  return {
    id,
    document_id: documentId,
    document_version_id: "v-1",
    signatario_id: "u-bruno",
    solicitante_id: "u-ana",
    pagina,
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
  };
}

const PENDENCIAS: PendenciaAssinatura[] = [
  { solicitacao: solicitacao("s-1", "d-1", 2), documento_nome: "Contrato principal" },
  { solicitacao: solicitacao("s-2", "d-2", 1), documento_nome: "ART do engenheiro" },
];

function renderizar() {
  render(
    <MemoryRouter>
      <MinhasPendencias />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.minhasPendencias).mockResolvedValue(PENDENCIAS);
});

describe("painel de pendencias", () => {
  it("lista o que espera a assinatura de quem esta autenticado", async () => {
    renderizar();

    const itens = await screen.findAllByTestId("pendencia");
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent("Contrato principal");
    expect(itens[1]).toHaveTextContent("ART do engenheiro");
  });

  it("pede a fila sem informar id de usuario", async () => {
    renderizar();
    await screen.findAllByTestId("pendencia");

    // A fronteira chama /me/signature-requests: o proprio servidor decide de
    // quem e a fila, e a tela nao filtra nada.
    expect(api.minhasPendencias).toHaveBeenCalledTimes(1);
    const argumentos = vi.mocked(api.minhasPendencias).mock.calls[0] ?? [];
    expect(argumentos.filter((a) => typeof a === "string")).toHaveLength(0);
  });

  it("cada item leva a tela de assinatura do seu documento", async () => {
    renderizar();

    const links = await screen.findAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/documentos/d-1/assinar");
    expect(links[1]).toHaveAttribute("href", "/documentos/d-2/assinar");
  });

  it("mostra a pagina e a data da solicitacao", async () => {
    renderizar();

    const itens = await screen.findAllByTestId("pendencia");
    expect(itens[0]).toHaveTextContent("página 2");
    expect(itens[0]?.textContent ?? "").toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("sem pendencias mostra estado vazio proprio, nao um erro", async () => {
    vi.mocked(api.minhasPendencias).mockResolvedValue([]);

    renderizar();

    expect(
      await screen.findByText(/Nenhum documento aguarda a sua assinatura/),
    ).toBeInTheDocument();
    // Nada a assinar e a situacao normal da maioria dos dias.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pendencia")).not.toBeInTheDocument();
  });

  it("distingue falha de lista vazia", async () => {
    vi.mocked(api.minhasPendencias).mockRejectedValue(
      new ApplicationError("Serviço indisponível.", "indisponivel", 503),
    );

    renderizar();

    expect(await screen.findByRole("alert")).toHaveTextContent("Serviço indisponível.");
    expect(
      screen.queryByText(/Nenhum documento aguarda a sua assinatura/),
    ).not.toBeInTheDocument();
  });

  it("distingue a primeira carga", () => {
    vi.mocked(api.minhasPendencias).mockReturnValue(new Promise(() => {}));

    renderizar();

    expect(screen.getByRole("status")).toHaveTextContent("Carregando pendências");
  });
});
