import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VisualizadorConteudo, classificar } from "./VisualizadorConteudo.tsx";

// O jsdom nao desenha canvas; o que estes testes cobrem e o despacho e o estado.
// Que a pagina apareca desenhada de verdade e provado em navegador, no E2E.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 595, height: 842 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
    }),
  })),
}));
const pdfjsFalso = await import("pdfjs-dist");

/**
 * A tarefa de carregamento do pdfjs declara dez campos internos que o componente
 * nunca toca — ele só aguarda `promise`. O molde é estreitado de propósito, em vez
 * de fingir uma tarefa completa que ninguém usa.
 */
type TarefaPdf = ReturnType<typeof pdfjsFalso.getDocument>;
function tarefaQueFalha(mensagem: string): TarefaPdf {
  return { promise: Promise.reject(new Error(mensagem)) } as unknown as TarefaPdf;
}

// O ponto destes testes: a decisao de renderizacao vem do Content-Type, e o
// nome do arquivo nunca participa dela.

describe("classificar", () => {
  const url = "blob:teste";

  it("reconhece PDF", () => {
    expect(classificar("application/pdf", url).tipo).toBe("pdf");
  });

  it("reconhece imagens por familia de tipo", () => {
    expect(classificar("image/png", url).tipo).toBe("imagem");
    expect(classificar("image/jpeg", url).tipo).toBe("imagem");
  });

  it("reconhece texto simples", () => {
    expect(classificar("text/plain", url, "oi").tipo).toBe("texto");
  });

  it("ignora parametros do cabecalho", () => {
    expect(classificar("text/plain; charset=utf-8", url, "oi").tipo).toBe("texto");
    expect(classificar("APPLICATION/PDF", url).tipo).toBe("pdf");
  });

  it("cai no download para tipos sem visualizacao propria", () => {
    const planilha = classificar(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      url,
    );
    expect(planilha.tipo).toBe("download");

    const word = classificar(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      url,
    );
    expect(word.tipo).toBe("download");
  });

  it("nao usa a extensao do nome do arquivo para decidir", () => {
    // Arquivo chamado .pdf que o servidor entrega como texto e texto.
    expect(classificar("text/plain", "blob:x", "conteudo").tipo).toBe("texto");
    // E um .txt entregue como PDF e PDF.
    expect(classificar("application/pdf", "blob:x").tipo).toBe("pdf");
  });
});

describe("VisualizadorConteudo", () => {
  it("renderiza texto simples com o conteudo do blob", async () => {
    render(
      <VisualizadorConteudo
        nome="observacoes.txt"
        blob={new Blob(["linha um"], { type: "text/plain" })}
        contentType="text/plain"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("linha um")).toBeInTheDocument();
    });
  });

  it("oferece download para tipo sem previa", () => {
    render(
      <VisualizadorConteudo
        nome="planilha.xlsx"
        blob={new Blob(["dados"])}
        contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      />,
    );

    expect(screen.getByRole("link", { name: /Baixar planilha.xlsx/ })).toBeInTheDocument();
  });

  it("da nome acessivel a imagem renderizada", () => {
    render(
      <VisualizadorConteudo
        nome="fachada.png"
        blob={new Blob(["png"], { type: "image/png" })}
        contentType="image/png"
      />,
    );

    expect(screen.getByRole("img", { name: "Documento fachada.png" })).toBeInTheDocument();
  });

  it("desenha o PDF com o proprio renderizador, sem depender de plugin", async () => {
    render(
      <VisualizadorConteudo
        nome="contrato.pdf"
        blob={new Blob(["%PDF"], { type: "application/pdf" })}
        contentType="application/pdf"
      />,
    );

    // O `<object type="application/pdf">` dependia do visualizador embutido do
    // navegador. Quando ele nao existe — Chrome sem o plugin, por exemplo — o
    // elemento cai no conteudo alternativo e o documento simplesmente nao
    // aparece. O app ja embarca pdfjs; usar plugin era a origem do defeito.
    expect(await screen.findByLabelText("Página 1")).toBeInTheDocument();
    expect(document.querySelector("object")).toBeNull();
  });

  it("no acervo o PDF e so leitura: nao oferece marcar area", async () => {
    render(
      <VisualizadorConteudo
        nome="contrato.pdf"
        blob={new Blob(["%PDF"], { type: "application/pdf" })}
        contentType="application/pdf"
      />,
    );
    await screen.findByLabelText("Página 1");

    // Marcar area pertence ao bloco de solicitar assinatura, que vive ao lado.
    // Duplicar a camada aqui daria dois controles identicos na mesma tela.
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByText(/Arraste sobre a página/)).not.toBeInTheDocument();
  });

  it("PDF ilegivel avisa e deixa tentar de novo", async () => {
    vi.mocked(pdfjsFalso.getDocument).mockImplementationOnce(() =>
      tarefaQueFalha("estrutura invalida"),
    );

    render(
      <VisualizadorConteudo
        nome="quebrado.pdf"
        blob={new Blob(["nao e pdf"], { type: "application/pdf" })}
        contentType="application/pdf"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível abrir/i);
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
