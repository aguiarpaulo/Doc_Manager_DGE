import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Usuario } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { AuthProvider } from "../auth/AuthContext.tsx";
import { RotaProtegida } from "../auth/RotaProtegida.tsx";
import { RegistroRubricaPage } from "./RegistroRubricaPage.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

const SEM_RUBRICA: Usuario = {
  id: "u-1",
  username: "paulo",
  email: "p@e.com",
  role: "engenheiro",
  is_active: true,
  has_signature: false,
};

const COM_RUBRICA: Usuario = { ...SEM_RUBRICA, has_signature: true };

function Protegida() {
  return <p>area protegida</p>;
}

function Arvore({ inicial = "/" }: { inicial?: string }) {
  return (
    <MemoryRouter initialEntries={[inicial]}>
      <AuthProvider>
        <Routes>
          <Route element={<RotaProtegida />}>
            <Route path="/rubrica" element={<RegistroRubricaPage />} />
            <Route path="/" element={<Protegida />} />
            <Route path="/obras/:id" element={<Protegida />} />
            <Route path="/administracao" element={<Protegida />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

/** Desenha um traço: pointer events cobrem mouse, dedo e caneta com um só caminho. */
function desenhar(tipo: "mouse" | "touch" | "pen" = "mouse") {
  const canvas = screen.getByRole("img", { name: /desenhar sua rubrica/i });
  fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: tipo, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: tipo, clientX: 60, clientY: 40 });
  fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: tipo, clientX: 90, clientY: 20 });
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: tipo });
  return canvas;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.sessionStorage.setItem("ged.sessao.refresh", "r");
  vi.mocked(api.refresh).mockResolvedValue({ access_token: "a" });
  vi.mocked(api.me).mockResolvedValue(SEM_RUBRICA);
  vi.mocked(api.registrarRubrica).mockResolvedValue({
    id: "r-1",
    tipo: "image/png",
    tamanho: 120,
    hash: "a".repeat(64),
    atualizado_em: "2026-08-19T12:00:00Z",
  });
});

// --- o guarda de rota ---------------------------------------------------------------


describe("guarda de rubrica", () => {
  it("manda para o registro quem ainda nao tem rubrica", async () => {
    render(<Arvore inicial="/" />);

    expect(
      await screen.findByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("area protegida")).not.toBeInTheDocument();
  });

  it("intercepta qualquer rota protegida, nao so a inicial", async () => {
    render(<Arvore inicial="/administracao" />);

    expect(
      await screen.findByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeInTheDocument();
  });

  it("nao aparece para quem ja tem rubrica", async () => {
    vi.mocked(api.me).mockResolvedValue(COM_RUBRICA);

    render(<Arvore inicial="/" />);

    expect(await screen.findByText("area protegida")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Registre a sua rubrica" }),
    ).not.toBeInTheDocument();
  });

  it("nao entra em laco quando a propria tela de registro e o destino", async () => {
    render(<Arvore inicial="/rubrica" />);

    // A tela de registro fica fora do guarda por construção.
    expect(
      await screen.findByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeInTheDocument();
  });
});

// --- aviso de coleta -----------------------------------------------------------------


describe("aviso de coleta", () => {
  it("explica o que e guardado e para que, antes da area de desenho", async () => {
    render(<Arvore inicial="/rubrica" />);

    const aviso = await screen.findByRole("region", {
      name: "O que é guardado e para quê",
    });
    expect(aviso).toHaveTextContent(/dado pessoal/i);
    expect(aviso).toHaveTextContent(/aplicada aos documentos que você assinar/i);
    expect(aviso).toHaveTextContent(/pode retirá-la quando quiser/i);
    // As assinaturas já feitas continuam válidas — a promessa do snapshot.
    expect(aviso).toHaveTextContent(/já tiver feito continuam válidas/i);

    // Vem antes do canvas no documento, não depois do gesto.
    const canvas = screen.getByRole("img", { name: /desenhar sua rubrica/i });
    expect(aviso.compareDocumentPosition(canvas)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("diz que nem um administrador ve a rubrica alheia", async () => {
    render(<Arvore inicial="/rubrica" />);

    const aviso = await screen.findByRole("region", {
      name: "O que é guardado e para quê",
    });
    expect(aviso).toHaveTextContent(/nem um administrador/i);
  });
});

// --- canvas vazio ---------------------------------------------------------------------


describe("canvas vazio", () => {
  it("mantem o botao de salvar desabilitado antes de qualquer traco", async () => {
    render(<Arvore inicial="/rubrica" />);

    const salvar = await screen.findByRole("button", { name: "Salvar rubrica" });
    expect(salvar).toBeDisabled();
  });

  it("habilita o salvar assim que ha traco", async () => {
    render(<Arvore inicial="/rubrica" />);
    await screen.findByRole("img", { name: /desenhar sua rubrica/i });

    desenhar();

    expect(screen.getByRole("button", { name: "Salvar rubrica" })).toBeEnabled();
  });

  it("volta a desabilitar depois de limpar, informando que falta desenhar", async () => {
    const user = userEvent.setup();
    render(<Arvore inicial="/rubrica" />);
    await screen.findByRole("img", { name: /desenhar sua rubrica/i });
    desenhar();

    await user.click(screen.getByRole("button", { name: "Limpar" }));

    expect(screen.getByRole("button", { name: "Salvar rubrica" })).toBeDisabled();
    expect(api.registrarRubrica).not.toHaveBeenCalled();
  });
});

// --- ponteiros ------------------------------------------------------------------------


describe("ponteiros", () => {
  it.each(["mouse", "touch", "pen"] as const)(
    "aceita traco de %s pelo mesmo caminho de pointer events",
    async (tipo) => {
      render(<Arvore inicial="/rubrica" />);
      await screen.findByRole("img", { name: /desenhar sua rubrica/i });

      const canvas = desenhar(tipo);

      // Um único conjunto de manipuladores serve aos três dispositivos.
      expect(canvas).toHaveAttribute("data-tem-traco", "sim");
      expect(screen.getByRole("button", { name: "Salvar rubrica" })).toBeEnabled();
    },
  );

  it("impede a pagina de rolar enquanto se desenha com o dedo", async () => {
    render(<Arvore inicial="/rubrica" />);

    const canvas = await screen.findByRole("img", { name: /desenhar sua rubrica/i });
    expect(canvas).toHaveStyle({ touchAction: "none" });
  });
});

// --- salvar ----------------------------------------------------------------------------


describe("salvar", () => {
  it("envia o PNG e segue para o destino que a pessoa tentava abrir", async () => {
    const user = userEvent.setup();
    // Depois de salvar, /auth/me passa a dizer que ha rubrica.
    vi.mocked(api.me)
      .mockResolvedValueOnce(SEM_RUBRICA)
      .mockResolvedValue(COM_RUBRICA);

    render(<Arvore inicial="/obras/obra-99" />);
    await screen.findByRole("heading", { name: "Registre a sua rubrica" });
    desenhar();

    await user.click(screen.getByRole("button", { name: "Salvar rubrica" }));

    await waitFor(() => {
      expect(api.registrarRubrica).toHaveBeenCalledWith(expect.any(Blob));
    });
    // Volta exatamente para onde ia, não para a raiz.
    expect(await screen.findByText("area protegida")).toBeInTheDocument();
  });

  it("envia um PNG, que e o unico formato que a API aceita", async () => {
    const user = userEvent.setup();
    vi.mocked(api.me).mockResolvedValueOnce(SEM_RUBRICA).mockResolvedValue(COM_RUBRICA);
    render(<Arvore inicial="/rubrica" />);
    await screen.findByRole("img", { name: /desenhar sua rubrica/i });
    desenhar();

    await user.click(screen.getByRole("button", { name: "Salvar rubrica" }));

    await waitFor(() => {
      expect(api.registrarRubrica).toHaveBeenCalled();
    });
    const enviado = vi.mocked(api.registrarRubrica).mock.calls[0]?.[0] as Blob;
    expect(enviado.type).toBe("image/png");
  });

  it("mostra o erro da API sem perder o desenho", async () => {
    const user = userEvent.setup();
    vi.mocked(api.registrarRubrica).mockRejectedValue(
      new ApplicationError("A rubrica precisa ser uma imagem PNG.", "validacao", 400),
    );
    render(<Arvore inicial="/rubrica" />);
    await screen.findByRole("img", { name: /desenhar sua rubrica/i });
    desenhar();

    await user.click(screen.getByRole("button", { name: "Salvar rubrica" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A rubrica precisa ser uma imagem PNG.",
    );
    // Continua na tela, com o traço preservado e o botão utilizável.
    expect(screen.getByRole("button", { name: "Salvar rubrica" })).toBeEnabled();
  });

  it("desabilita o envio enquanto salva, impedindo duplicidade", async () => {
    const user = userEvent.setup();
    let liberar: (v: never) => void = () => {};
    vi.mocked(api.registrarRubrica).mockReturnValue(
      new Promise((resolve) => {
        liberar = resolve as (v: never) => void;
      }),
    );
    render(<Arvore inicial="/rubrica" />);
    await screen.findByRole("img", { name: /desenhar sua rubrica/i });
    desenhar();

    await user.click(screen.getByRole("button", { name: "Salvar rubrica" }));

    expect(await screen.findByRole("button", { name: "Salvando..." })).toBeDisabled();
    liberar(undefined as never);
  });
});
