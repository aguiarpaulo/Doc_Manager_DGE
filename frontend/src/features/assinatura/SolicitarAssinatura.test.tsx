import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SolicitacaoAssinatura, Usuario } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { SolicitarAssinatura } from "./SolicitarAssinatura.tsx";
import { moverArea, type AreaNormalizada } from "./VisualizadorPdf.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

// A4 em pontos: o que um visualizador real relata para uma página padrão.
const A4 = { largura: 595.28, altura: 841.89 };

/**
 * `pdfjs-dist` é simulado: o jsdom não renderiza PDF, e o que esta suíte cobre é
 * a *lógica* — normalização de coordenadas, teclado, estados. Que a página
 * apareça desenhada só se prova em navegador, no NODE-040.
 */
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: A4.largura, height: A4.altura }),
          render: () => ({ promise: Promise.resolve() }),
        }),
    }),
  })),
}));

const CANDIDATOS: Usuario[] = [
  {
    id: "u-bruno",
    username: "bruno",
    email: "b@e.com",
    role: "engenheiro",
    is_active: true,
    has_signature: true,
  },
  {
    id: "u-carla",
    username: "carla",
    email: "c@e.com",
    role: "engenheiro",
    is_active: true,
    has_signature: true,
  },
];

const SOLICITACAO: SolicitacaoAssinatura = {
  id: "s-1",
  document_id: "d-1",
  document_version_id: "v-1",
  signatario_id: "u-bruno",
  solicitante_id: "u-ana",
  pagina: 2,
  x: 0.2,
  y: 0.6,
  largura: 0.3,
  altura: 0.1,
  page_width: A4.largura,
  page_height: A4.altura,
  status: "pendente",
  motivo: null,
  criado_em: "2026-08-19T12:00:00Z",
  encerrado_em: null,
};

function pdfBlob() {
  return new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" });
}

function renderizar(props: Partial<Parameters<typeof SolicitarAssinatura>[0]> = {}) {
  const aoSolicitar = vi.fn();
  render(
    <SolicitarAssinatura
      documentoId="d-1"
      contentType="application/pdf"
      arquivo={pdfBlob()}
      candidatos={CANDIDATOS}
      aoSolicitar={aoSolicitar}
      {...props}
    />,
  );
  return { aoSolicitar };
}

/** Arrasta sobre a camada de marcação, informando a geometria que o jsdom não calcula. */
async function arrastar(pagina: number, inicio: [number, number], fim: [number, number]) {
  const camada = await screen.findByRole("application", {
    name: new RegExp(`página ${String(pagina)}`, "i"),
  });
  // jsdom devolve zeros em getBoundingClientRect; a área precisa de um retângulo.
  camada.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600, x: 0, y: 0 }) as DOMRect;

  fireEvent.pointerDown(camada, { clientX: inicio[0], clientY: inicio[1] });
  fireEvent.pointerUp(camada, { clientX: fim[0], clientY: fim[1] });
  return camada;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.solicitarAssinatura).mockResolvedValue(SOLICITACAO);
});

// --- normalização de coordenadas ------------------------------------------------------


describe("coordenadas", () => {
  it("converte o arrasto em fracoes da pagina, nao em pixels", async () => {
    renderizar();

    // 400x600 de área; de (40,60) a (160,120) → x=0.1 y=0.1 larg=0.3 alt=0.1
    await arrastar(1, [40, 60], [160, 120]);

    const resumo = await screen.findByTestId("resumo-area");
    expect(resumo).toHaveTextContent("30% × 10% da página");
  });

  it("produz a mesma fracao com a pagina renderizada em outro tamanho", async () => {
    renderizar();
    const camada = await screen.findByRole("application", { name: /página 1/i });

    // O mesmo retângulo relativo, numa área com o dobro do tamanho: mesmas frações.
    camada.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 1200, right: 800, bottom: 1200, x: 0, y: 0 }) as DOMRect;
    fireEvent.pointerDown(camada, { clientX: 80, clientY: 120 });
    fireEvent.pointerUp(camada, { clientX: 320, clientY: 240 });

    expect(await screen.findByTestId("resumo-area")).toHaveTextContent(
      "30% × 10% da página",
    );
  });

  it("ignora um clique solto, que nao e area", async () => {
    renderizar();

    await arrastar(1, [40, 60], [41, 61]);

    expect(screen.queryByTestId("resumo-area")).not.toBeInTheDocument();
  });

  it("envia as dimensoes da pagina em pontos, como o PDF as declara", async () => {
    const user = userEvent.setup();
    renderizar();
    await arrastar(1, [40, 60], [160, 120]);
    await user.selectOptions(screen.getByLabelText("Quem deve assinar"), "u-bruno");

    await user.click(screen.getByRole("button", { name: "Solicitar assinatura" }));

    await waitFor(() => {
      expect(api.solicitarAssinatura).toHaveBeenCalled();
    });
    const enviado = vi.mocked(api.solicitarAssinatura).mock.calls[0]?.[1];
    expect(enviado?.pageWidth).toBeCloseTo(A4.largura, 2);
    expect(enviado?.pageHeight).toBeCloseTo(A4.altura, 2);
    // Origem no topo, como foi desenhado: nada aqui inverte o eixo.
    expect(enviado?.y).toBeCloseTo(0.1, 5);
  });
});

// --- marcar e solicitar ----------------------------------------------------------------


describe("solicitar", () => {
  it("cria a solicitacao com a pagina marcada e o signatario escolhido", async () => {
    const user = userEvent.setup();
    const { aoSolicitar } = renderizar();
    // O seletor de página só existe depois que o documento carrega.
    await screen.findByRole("application", { name: /página 1/i });

    await user.selectOptions(screen.getByLabelText("Página"), "2");
    await arrastar(2, [40, 60], [160, 120]);
    await user.selectOptions(screen.getByLabelText("Quem deve assinar"), "u-carla");
    await user.click(screen.getByRole("button", { name: "Solicitar assinatura" }));

    await waitFor(() => {
      expect(aoSolicitar).toHaveBeenCalled();
    });
    expect(api.solicitarAssinatura).toHaveBeenCalledWith(
      "d-1",
      expect.objectContaining({ pagina: 2, signatarioId: "u-carla" }),
    );
  });

  it("mantem o botao desabilitado sem area ou sem signatario", async () => {
    const user = userEvent.setup();
    renderizar();
    await screen.findByRole("application", { name: /página 1/i });

    const botao = screen.getByRole("button", { name: "Solicitar assinatura" });
    expect(botao).toBeDisabled();

    await arrastar(1, [40, 60], [160, 120]);
    expect(botao).toBeDisabled(); // falta o signatário

    await user.selectOptions(screen.getByLabelText("Quem deve assinar"), "u-bruno");
    expect(botao).toBeEnabled();
  });

  it("mostra o erro da API sem perder a marcacao", async () => {
    const user = userEvent.setup();
    vi.mocked(api.solicitarAssinatura).mockRejectedValue(
      new ApplicationError(
        "O signatário indicado não tem acesso à obra deste documento.",
        "autorizacao",
        403,
      ),
    );
    renderizar();
    await arrastar(1, [40, 60], [160, 120]);
    await user.selectOptions(screen.getByLabelText("Quem deve assinar"), "u-bruno");

    await user.click(screen.getByRole("button", { name: "Solicitar assinatura" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("não tem acesso à obra");
    expect(screen.getByTestId("resumo-area")).toBeInTheDocument();
  });
});

// --- tipo de arquivo -------------------------------------------------------------------


describe("tipos nao-PDF", () => {
  it("nao oferece a acao para uma planilha", () => {
    renderizar({
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(
      screen.queryByRole("button", { name: "Solicitar assinatura" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Só é possível marcar área de assinatura em PDF/)).toBeInTheDocument();
  });

  it("decide pelo Content-Type, tolerando parametros", () => {
    renderizar({ contentType: "application/pdf; charset=binary" });

    expect(
      screen.getByRole("heading", { name: "Solicitar assinatura" }),
    ).toBeInTheDocument();
  });

  it("nao oferece a acao para imagem, mesmo com nome de pdf", () => {
    renderizar({ contentType: "image/png" });

    expect(
      screen.queryByRole("button", { name: "Solicitar assinatura" }),
    ).not.toBeInTheDocument();
  });
});

// --- teclado ---------------------------------------------------------------------------


describe("teclado", () => {
  const base: AreaNormalizada = {
    pagina: 1,
    x: 0.5,
    y: 0.5,
    largura: 0.2,
    altura: 0.1,
    pageWidth: A4.largura,
    pageHeight: A4.altura,
  };

  it("as setas movem a area em fracoes da pagina", () => {
    expect(moverArea(base, { eixo: "x", delta: 0.01, redimensiona: false }).x).toBeCloseTo(0.51);
    expect(moverArea(base, { eixo: "y", delta: -0.01, redimensiona: false }).y).toBeCloseTo(0.49);
  });

  it("Alt redimensiona em vez de mover", () => {
    const maior = moverArea(base, { eixo: "x", delta: 0.05, redimensiona: true });
    expect(maior.largura).toBeCloseTo(0.25);
    expect(maior.x).toBe(base.x);
  });

  it("a area nunca sai da pagina, nem movendo nem redimensionando", () => {
    const empurrada = moverArea(base, { eixo: "x", delta: 5, redimensiona: false });
    expect(empurrada.x + empurrada.largura).toBeLessThanOrEqual(1);

    const esticada = moverArea(base, { eixo: "y", delta: 5, redimensiona: true });
    expect(esticada.y + esticada.altura).toBeLessThanOrEqual(1);

    const encolhida = moverArea(base, { eixo: "x", delta: -5, redimensiona: true });
    expect(encolhida.largura).toBeGreaterThan(0);
  });

  it("a camada de marcacao recebe foco e responde as setas", async () => {
    renderizar();
    await arrastar(1, [40, 60], [160, 120]);
    const camada = screen.getByRole("application", { name: /página 1/i });

    expect(camada).toHaveAttribute("tabindex", "0");

    const antes = screen.getByTestId("area-marcada").style.left;
    fireEvent.keyDown(camada, { key: "ArrowRight" });
    await waitFor(() => {
      expect(screen.getByTestId("area-marcada").style.left).not.toBe(antes);
    });
  });

  it("explica os atalhos junto do controle", async () => {
    renderizar();
    const camada = await screen.findByRole("application", { name: /página 1/i });

    expect(camada).toHaveAccessibleDescription(/setas movem/i);
  });
});

// --- estados ----------------------------------------------------------------------------


describe("estados do documento", () => {
  it("mostra carga e depois o documento", async () => {
    renderizar();

    // Antes de o pdfjs resolver, um estado de carga próprio.
    expect(screen.getByRole("status")).toHaveTextContent("Carregando o documento");
    expect(
      await screen.findByRole("application", { name: /página 1/i }),
    ).toBeInTheDocument();
  });

  it("distingue falha ao abrir o PDF, com acao de tentar de novo", async () => {
    const pdfjs = await import("pdfjs-dist");
    vi.mocked(pdfjs.getDocument).mockReturnValueOnce({
      promise: Promise.reject(new Error("arquivo corrompido")),
    } as unknown as ReturnType<typeof pdfjs.getDocument>);

    renderizar();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("arquivo corrompido");
    // Falha acionável, não um beco sem saída.
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
