import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Documento } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { FormularioUpload, validarArquivo } from "./FormularioUpload.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

const DOCUMENTO: Documento = {
  id: "d-1",
  nome: "Contrato principal",
  obra_id: "o-1",
  categoria: "contrato",
  status: "enviado",
  criado_por: "u-1",
  criado_em: "2026-01-05T10:00:00Z",
  current_version: 0,
};

function pdf(nome = "contrato.pdf"): File {
  return new File([new Uint8Array([37, 80, 68, 70])], nome, { type: "application/pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.criarDocumento).mockResolvedValue(DOCUMENTO);
  vi.mocked(api.enviarVersao).mockResolvedValue({
    id: "v-1",
    document_id: "d-1",
    version: 1,
    tamanho: 4,
    tipo: "application/pdf",
    hash: "a".repeat(64),
  });
});

async function preencher(arquivo: File) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nome"), "Contrato principal");
  await user.selectOptions(screen.getByLabelText("Categoria"), "contrato");
  await user.upload(screen.getByLabelText("Arquivo"), arquivo);
  return user;
}

describe("FormularioUpload", () => {
  it("cria os metadados e depois envia o arquivo, nas duas chamadas que a API exige", async () => {
    const aoConcluir = vi.fn();
    render(<FormularioUpload obraId="o-1" aoConcluir={aoConcluir} />);

    const user = await preencher(pdf());
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => {
      expect(aoConcluir).toHaveBeenCalled();
    });

    // obra_id vai como UUID em JSON, nao como campo de formulario: e o
    // contrato que a API valida (licao do NODE-015).
    expect(api.criarDocumento).toHaveBeenCalledWith({
      nome: "Contrato principal",
      obraId: "o-1",
      categoria: "contrato",
    });
    expect(api.enviarVersao).toHaveBeenCalledWith("d-1", expect.any(File));
  });

  it("oferece exatamente as categorias do enum do backend", () => {
    render(<FormularioUpload obraId="o-1" aoConcluir={vi.fn()} />);

    const opcoes = within(screen.getByLabelText("Categoria")).getAllByRole("option");
    expect(opcoes.map((o) => o.getAttribute("value"))).toEqual([
      "contrato",
      "projeto",
      "nota_fiscal",
      "licenca",
      "laudo",
      "outros",
    ]);
  });

  it("aceita os tipos que o servidor aceita e recusa os demais", () => {
    // Testado como funcao pura: o atributo `accept` do input impede que o
    // navegador (e o userEvent) sequer anexem um tipo recusado, entao o
    // caminho por interacao nao existe. A recusa do servidor esta coberta em
    // documentos.integration.test.ts contra a API real.
    const pdfOk = new File([new Uint8Array([37])], "c.pdf", { type: "application/pdf" });
    expect(validarArquivo(pdfOk)).toBeNull();

    const exe = new File([new Uint8Array([77, 90])], "m.exe", {
      type: "application/x-msdownload",
    });
    expect(validarArquivo(exe)).toMatch(/nao aceito/);

    const semTipo = new File([new Uint8Array([1])], "x", { type: "" });
    expect(validarArquivo(semTipo)).toMatch(/desconhecido/);
  });

  it("recusa arquivo acima do limite de 50 MB sem ir ate a API", () => {
    const gigante = new File([new Uint8Array(1)], "grande.pdf", { type: "application/pdf" });
    Object.defineProperty(gigante, "size", { value: 51 * 1024 * 1024 });
    expect(validarArquivo(gigante)).toMatch(/50 MB/);
  });

  it("mostra o erro vindo da API sem quebrar a tela", async () => {
    vi.mocked(api.enviarVersao).mockRejectedValue(
      new ApplicationError("Documento duplicado nesta obra.", "conflito", 409),
    );
    render(<FormularioUpload obraId="o-1" aoConcluir={vi.fn()} />);

    const user = await preencher(pdf());
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Documento duplicado nesta obra.",
    );
    // A tela continua utilizavel apos a falha.
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("desabilita o envio enquanto a operacao esta em curso", async () => {
    let liberar: (v: Documento) => void = () => {};
    vi.mocked(api.criarDocumento).mockReturnValue(
      new Promise<Documento>((resolve) => {
        liberar = resolve;
      }),
    );
    render(<FormularioUpload obraId="o-1" aoConcluir={vi.fn()} />);

    const user = await preencher(pdf());
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    // Impede submissao duplicada por clique repetido.
    const botao = await screen.findByRole("button", { name: "Enviando..." });
    expect(botao).toBeDisabled();
    liberar(DOCUMENTO);
  });

  it("nao permite enviar sem arquivo escolhido", () => {
    render(<FormularioUpload obraId="o-1" aoConcluir={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });
});
