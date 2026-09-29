/**
 * O que faltava: alguém conferir que a página é **desenhada**.
 *
 * Todos os testes que montam esta tela dublavam `render` e nenhum verificava se
 * ele chegava a ser chamado. Não era chamado: o laço procurava
 * `canvas[data-pagina=N]` enquanto o estado ainda era "carregando" — instante em
 * que o componente só renderiza o parágrafo de carga e os canvases não existem no
 * DOM. `containerRef.current` era `null`, o desenho nunca acontecia, e o usuário
 * via um retângulo em branco onde deveria estar o documento.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VisualizadorPdf } from "./VisualizadorPdf.tsx";

/** O que o pdfjs recebeu para desenhar, na ordem em que foi pedido. */
const desenhado: { canvas: HTMLCanvasElement }[] = [];
const desenhar = vi.fn((parametros: { canvas: HTMLCanvasElement }) => {
  desenhado.push(parametros);
  return { promise: Promise.resolve(), cancel: vi.fn() };
});
const paginasPedidas: number[] = [];

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: (numero: number) => {
        paginasPedidas.push(numero);
        return Promise.resolve({
          // Tamanhos diferentes por página: um PDF pode misturá-los, e é isso que
          // o canvas precisa respeitar.
          getViewport: () => ({ width: numero === 2 ? 842 : 595, height: 842 }),
          render: desenhar,
        });
      },
    }),
  })),
}));

const PDF = new Blob(["%PDF-1.4"], { type: "application/pdf" });

beforeEach(() => {
  desenhar.mockClear();
  desenhado.length = 0;
  paginasPedidas.length = 0;
});

describe("desenho da pagina", () => {
  it("desenha a pagina no canvas depois que ele existe no DOM", async () => {
    render(<VisualizadorPdf arquivo={PDF} areaAtual={null} somenteLeitura />);

    await waitFor(() => {
      expect(desenhar).toHaveBeenCalled();
    });

    // O alvo do desenho é um canvas que está montado — era exatamente isto que
    // faltava: antes o elemento ainda não existia e nada era desenhado.
    const alvo = desenhado[0]?.canvas;
    expect(alvo).toBeInstanceOf(HTMLCanvasElement);
    expect(alvo?.isConnected).toBe(true);
  });

  it("dimensiona o canvas pelo viewport da pagina, nao pelo padrao 300x150", async () => {
    render(<VisualizadorPdf arquivo={PDF} areaAtual={null} somenteLeitura />);

    await waitFor(() => {
      expect(desenhar).toHaveBeenCalled();
    });

    const canvas = screen.getByLabelText("Página 1") as HTMLCanvasElement;
    expect(canvas.width).toBe(595);
    expect(canvas.height).toBe(842);
  });

  it("desenha so a pagina visivel, nao o documento inteiro", async () => {
    render(<VisualizadorPdf arquivo={PDF} areaAtual={null} somenteLeitura />);

    await waitFor(() => {
      expect(desenhar).toHaveBeenCalled();
    });

    // Três páginas no documento, uma só desenhada: um PDF longo não pode custar
    // o render de todas as páginas para mostrar a primeira.
    expect(desenhar).toHaveBeenCalledTimes(1);
  });

  it("ao trocar de pagina desenha a nova", async () => {
    const user = userEvent.setup();
    render(<VisualizadorPdf arquivo={PDF} areaAtual={null} somenteLeitura />);
    await waitFor(() => {
      expect(desenhar).toHaveBeenCalled();
    });
    desenhar.mockClear();

    await user.selectOptions(screen.getByLabelText("Página"), "2");

    await waitFor(() => {
      expect(desenhar).toHaveBeenCalled();
    });
    const canvas = screen.getByLabelText("Página 2") as HTMLCanvasElement;
    expect(canvas.width).toBe(842);
  });
});

describe("modo somente leitura", () => {
  it("nao oferece camada de marcacao", async () => {
    render(<VisualizadorPdf arquivo={PDF} areaAtual={null} somenteLeitura />);
    await screen.findByLabelText("Página 1");

    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByText(/Arraste sobre a página/)).not.toBeInTheDocument();
  });

  it("com marcacao habilitada a camada existe e e focavel", async () => {
    render(<VisualizadorPdf arquivo={PDF} areaAtual={null} aoMarcar={vi.fn()} />);
    await screen.findByLabelText("Página 1");

    const camada = screen.getByRole("application", { name: /Marcar área/ });
    expect(camada).toHaveAttribute("tabindex", "0");
    expect(screen.getByText(/Arraste sobre a página/)).toBeInTheDocument();
  });
});
