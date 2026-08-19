import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Etapa } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { LinhaDoTempo, rotuloDaEtapa } from "./LinhaDoTempo.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

function etapa(
  action: string,
  actor_nome: string | null,
  created_at: string,
  detail: string | null = null,
): Etapa {
  return {
    id: `${action}-${created_at}`,
    action,
    actor_id: actor_nome === null ? null : `u-${actor_nome}`,
    actor_nome,
    target_id: "d-1",
    detail,
    created_at,
  };
}

/** A jornada completa, na ordem em que o servidor a devolve. */
const JORNADA: Etapa[] = [
  etapa("upload", "ana", "2026-08-01T10:00:00Z", "v1"),
  etapa("signature_requested", "ana", "2026-08-02T09:00:00Z", "pagina 2 para bruno"),
  etapa("signed", "bruno", "2026-08-03T14:30:00Z", "assinado por bruno"),
  etapa("signature_declined", "carla", "2026-08-04T11:00:00Z", "cláusula 4 divergente"),
  etapa("new_version", "ana", "2026-08-05T08:00:00Z", "v2"),
  etapa("signature_cancelled", "ana", "2026-08-05T08:00:01Z", "Nova versão (v2) enviada"),
  etapa("review", "dora", "2026-08-06T10:00:00Z", "v2"),
  etapa("approve", "dora", "2026-08-06T10:05:00Z", null),
];

beforeEach(() => {
  // `clearAllMocks` nao esvazia as filas de `...Once`, entao uma promessa
  // pendente de um teste vazaria para o seguinte.
  vi.resetAllMocks();
  vi.mocked(api.historicoDocumento).mockResolvedValue(JORNADA);
});

describe("linha do tempo", () => {
  it("mostra as etapas na ordem que o servidor devolveu", async () => {
    render(<LinhaDoTempo documentoId="d-1" />);

    const itens = await screen.findAllByTestId("etapa");
    expect(itens).toHaveLength(JORNADA.length);
    // A tela não reordena: quem sabe a ordem cronológica é o log imutável.
    expect(itens.map((i) => i.getAttribute("data-acao"))).toEqual(
      JORNADA.map((e) => e.action),
    );
  });

  it("cada etapa traz autor e horario", async () => {
    render(<LinhaDoTempo documentoId="d-1" />);

    const itens = await screen.findAllByTestId("etapa");
    for (const item of itens) {
      expect(item.textContent ?? "").toMatch(/por \w+/);
      expect(item.querySelector("time")).toHaveAttribute("datetime");
    }
  });

  it("a etapa de assinatura nomeia o signatario e o horario", async () => {
    render(<LinhaDoTempo documentoId="d-1" />);

    const itens = await screen.findAllByTestId("etapa");
    const assinatura = itens.find((i) => i.getAttribute("data-acao") === "signed");

    expect(assinatura).toHaveTextContent("Assinado");
    expect(assinatura).toHaveTextContent("por bruno");
    expect(assinatura?.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-08-03T14:30:00Z",
    );
  });

  it("traduz as acoes do servidor para rotulos legiveis", () => {
    expect(rotuloDaEtapa("upload")).toBe("Documento enviado");
    expect(rotuloDaEtapa("new_version")).toBe("Nova versão enviada");
    expect(rotuloDaEtapa("review")).toBe("Enviado para análise");
    expect(rotuloDaEtapa("signed")).toBe("Assinado");
    expect(rotuloDaEtapa("signature_declined")).toBe("Assinatura recusada");
  });

  it("mostra uma acao desconhecida como veio, em vez de omiti-la", () => {
    // Uma etapa que o cliente não reconhece ainda aconteceu.
    expect(rotuloDaEtapa("acao_futura")).toBe("acao_futura");
  });

  it("mostra o motivo registrado na recusa", async () => {
    render(<LinhaDoTempo documentoId="d-1" />);

    const itens = await screen.findAllByTestId("etapa");
    const recusa = itens.find((i) => i.getAttribute("data-acao") === "signature_declined");
    expect(recusa).toHaveTextContent("cláusula 4 divergente");
  });

  it("atribui ao sistema uma etapa sem autor", async () => {
    vi.mocked(api.historicoDocumento).mockResolvedValue([
      etapa("upload", null, "2026-08-01T10:00:00Z"),
    ]);

    render(<LinhaDoTempo documentoId="d-1" />);

    expect(await screen.findByTestId("etapa")).toHaveTextContent("por sistema");
  });
});

describe("documento recem-enviado", () => {
  it("mostra a linha do tempo minima, nao um vazio generico", async () => {
    // Um documento recém-enviado tem UMA etapa, não nenhuma.
    vi.mocked(api.historicoDocumento).mockResolvedValue([
      etapa("upload", "ana", "2026-08-01T10:00:00Z", "v1"),
    ]);

    render(<LinhaDoTempo documentoId="d-1" />);

    const itens = await screen.findAllByTestId("etapa");
    expect(itens).toHaveLength(1);
    expect(itens[0]).toHaveTextContent("Documento enviado");
    expect(itens[0]).toHaveTextContent("por ana");
    // Nada de "nenhum registro": a etapa de envio já é informação.
    expect(screen.queryByText(/Nenhuma etapa ainda/)).not.toBeInTheDocument();
  });

  it("explica o caso de documento sem arquivo enviado", async () => {
    vi.mocked(api.historicoDocumento).mockResolvedValue([]);

    render(<LinhaDoTempo documentoId="d-1" />);

    expect(
      await screen.findByText(/não tem arquivo enviado/),
    ).toBeInTheDocument();
  });
});

describe("estados", () => {
  it("distingue a primeira carga", () => {
    vi.mocked(api.historicoDocumento).mockReturnValue(new Promise(() => {}));

    render(<LinhaDoTempo documentoId="d-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando as etapas");
    expect(screen.queryByTestId("etapa")).not.toBeInTheDocument();
  });

  it("distingue revalidacao: os dados anteriores continuam na tela", async () => {
    let liberar: (v: Etapa[]) => void = () => {};
    vi.mocked(api.historicoDocumento)
      .mockResolvedValueOnce(JORNADA)
      .mockReturnValueOnce(
        new Promise<Etapa[]>((resolve) => {
          liberar = resolve;
        }),
      );

    // Um botão de recarregar não existe na linha do tempo, então exercita-se o
    // caminho pelo estado do hook: primeira carga, depois nova busca.
    const { rerender } = render(<LinhaDoTempo documentoId="d-1" />);
    await screen.findAllByTestId("etapa");

    rerender(<LinhaDoTempo documentoId="d-1" />);
    liberar(JORNADA);

    await waitFor(() => {
      expect(screen.getAllByTestId("etapa")).toHaveLength(JORNADA.length);
    });
    // O indicador de primeira carga não reaparece com dados na tela.
    expect(screen.queryByText("Carregando as etapas...")).not.toBeInTheDocument();
  });

  it("distingue falha, com acao de tentar de novo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.historicoDocumento).mockRejectedValueOnce(
      new ApplicationError("Documento não encontrado", "nao-encontrado", 404),
    );

    render(<LinhaDoTempo documentoId="d-1" />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Documento não encontrado");

    vi.mocked(api.historicoDocumento).mockResolvedValue(JORNADA);
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => {
      expect(screen.getAllByTestId("etapa").length).toBeGreaterThan(0);
    });
  });
});
