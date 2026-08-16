import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VisualizadorConteudo, classificar } from "./VisualizadorConteudo.tsx";

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

  it("mantem saida por download quando o PDF nao pode ser exibido", () => {
    render(
      <VisualizadorConteudo
        nome="contrato.pdf"
        blob={new Blob(["%PDF"], { type: "application/pdf" })}
        contentType="application/pdf"
      />,
    );

    // O conteudo alternativo do <object> e a rede de seguranca do navegador
    // sem visualizador embutido.
    expect(screen.getByRole("link", { name: /Baixar contrato.pdf/ })).toBeInTheDocument();
  });
});
