import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Usuario } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { AuthProvider } from "../auth/AuthContext.tsx";
import { RotaProtegida } from "../auth/RotaProtegida.tsx";
import { PerfilRubricaPage } from "./PerfilRubricaPage.tsx";
import { RegistroRubricaPage } from "./RegistroRubricaPage.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

const COM_RUBRICA: Usuario = {
  id: "u-1",
  username: "paulo",
  email: "p@e.com",
  role: "engenheiro",
  is_active: true,
  has_signature: true,
};

const SEM_RUBRICA: Usuario = { ...COM_RUBRICA, has_signature: false };

function Protegida() {
  return <p>area protegida</p>;
}

function Arvore({ inicial = "/perfil/rubrica" }: { inicial?: string }) {
  return (
    <MemoryRouter initialEntries={[inicial]}>
      <AuthProvider>
        <Routes>
          <Route element={<RotaProtegida />}>
            <Route path="/perfil/rubrica" element={<PerfilRubricaPage />} />
            <Route path="/rubrica" element={<RegistroRubricaPage />} />
            <Route
              path="/"
              element={
                <>
                  <Protegida />
                  {/* Um destino para exercer o guarda depois de apagar. */}
                  <Link to="/obras/o-1">ir para a obra</Link>
                </>
              }
            />
            <Route path="/obras/:id" element={<Protegida />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

function desenhar() {
  const canvas = screen.getByRole("img", { name: /desenhar sua rubrica/i });
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 60, clientY: 40 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
  return canvas;
}

const PNG = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  window.sessionStorage.setItem("ged.sessao.refresh", "r");
  vi.mocked(api.refresh).mockResolvedValue({ access_token: "a" });
  vi.mocked(api.me).mockResolvedValue(COM_RUBRICA);
  vi.mocked(api.baixarRubrica).mockResolvedValue({
    blob: PNG,
    contentType: "image/png",
  });
  vi.mocked(api.apagarRubrica).mockResolvedValue(undefined);
  vi.mocked(api.registrarRubrica).mockResolvedValue({
    id: "r-2",
    tipo: "image/png",
    tamanho: 120,
    hash: "b".repeat(64),
    atualizado_em: "2026-08-19T12:00:00Z",
  });
});

// --- ver a rubrica ------------------------------------------------------------------

describe("ver a rubrica", () => {
  it("mostra a rubrica registrada quando ela existe", async () => {
    render(<Arvore />);

    expect(await screen.findByAltText("Sua rubrica registrada")).toBeInTheDocument();
    expect(api.baixarRubrica).toHaveBeenCalled();
  });

  it("convida ao registro quando nao existe, sem tentar baixar nada", async () => {
    vi.mocked(api.me).mockResolvedValue(SEM_RUBRICA);

    render(<Arvore />);

    expect(
      await screen.findByRole("heading", { name: /ainda não registrou uma rubrica/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrar agora" })).toHaveAttribute(
      "href",
      "/rubrica",
    );
    expect(api.baixarRubrica).not.toHaveBeenCalled();
  });

  it("distingue carregando de erro, e o erro e acionavel", async () => {
    let liberar: (v: { blob: Blob; contentType: string }) => void = () => {};
    vi.mocked(api.baixarRubrica).mockReturnValueOnce(
      new Promise((resolve) => {
        liberar = resolve;
      }),
    );

    render(<Arvore />);
    // Espera a sessao ser reconstruida: o guarda tambem usa role="status"
    // ("Verificando sessao..."), e sem isto a busca acharia o indicador errado.
    await screen.findByRole("heading", { name: "Rubrica registrada" });

    // Carga: um indicador de status, nenhum alerta.
    expect(screen.getByRole("status")).toHaveTextContent(/carregando/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    liberar({ blob: PNG, contentType: "image/png" });
    expect(await screen.findByAltText("Sua rubrica registrada")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("oferece tentar de novo quando a leitura falha", async () => {
    const user = userEvent.setup();
    vi.mocked(api.baixarRubrica)
      .mockRejectedValueOnce(
        new ApplicationError("Servico indisponivel.", "indisponivel", 503),
      )
      .mockResolvedValue({ blob: PNG, contentType: "image/png" });

    render(<Arvore />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Servico indisponivel.");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByAltText("Sua rubrica registrada")).toBeInTheDocument();
  });
});

// --- trocar -------------------------------------------------------------------------

describe("trocar a rubrica", () => {
  it("abre o mesmo canvas do primeiro acesso", async () => {
    const user = userEvent.setup();
    render(<Arvore />);
    await screen.findByAltText("Sua rubrica registrada");

    // Antes de pedir, nao ha area de desenho ocupando a tela.
    expect(
      screen.queryByRole("img", { name: /desenhar sua rubrica/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Trocar rubrica" }));

    expect(
      screen.getByRole("img", { name: /desenhar sua rubrica/i }),
    ).toBeInTheDocument();
  });

  it("substitui a anterior e volta a mostrar a rubrica atual", async () => {
    const user = userEvent.setup();
    render(<Arvore />);
    await screen.findByAltText("Sua rubrica registrada");
    await user.click(screen.getByRole("button", { name: "Trocar rubrica" }));
    desenhar();

    await user.click(screen.getByRole("button", { name: "Salvar nova rubrica" }));

    await waitFor(() => {
      expect(api.registrarRubrica).toHaveBeenCalledWith(expect.any(Blob));
    });
    // PUT: a mesma chamada do registro, que sobrescreve em vez de acumular.
    expect(api.registrarRubrica).toHaveBeenCalledTimes(1);
    // O canvas se fecha e a tela volta a exibir a rubrica, agora relida.
    await waitFor(() => {
      expect(
        screen.queryByRole("img", { name: /desenhar sua rubrica/i }),
      ).not.toBeInTheDocument();
    });
    expect(vi.mocked(api.baixarRubrica).mock.calls.length).toBeGreaterThan(1);
  });

  it("nao deixa salvar um canvas em branco", async () => {
    const user = userEvent.setup();
    render(<Arvore />);
    await screen.findByAltText("Sua rubrica registrada");

    await user.click(screen.getByRole("button", { name: "Trocar rubrica" }));

    expect(screen.getByRole("button", { name: "Salvar nova rubrica" })).toBeDisabled();
    expect(api.registrarRubrica).not.toHaveBeenCalled();
  });
});

// --- apagar --------------------------------------------------------------------------

describe("apagar a rubrica", () => {
  async function abrirExclusao() {
    const user = userEvent.setup();
    render(<Arvore />);
    await screen.findByAltText("Sua rubrica registrada");
    await user.click(screen.getByRole("button", { name: "Apagar rubrica" }));
    return user;
  }

  it("exige a senha antes de apagar", async () => {
    const user = await abrirExclusao();

    const dialogo = screen.getByRole("dialog", { name: "Apagar a rubrica" });
    expect(dialogo).toBeInTheDocument();
    // Sem senha digitada o botao nao age.
    expect(
      screen.getByRole("button", { name: "Apagar definitivamente" }),
    ).toBeDisabled();

    await user.type(screen.getByLabelText("Confirme sua senha"), "senha-boa");
    await user.click(screen.getByRole("button", { name: "Apagar definitivamente" }));

    await waitFor(() => {
      expect(api.apagarRubrica).toHaveBeenCalledWith("senha-boa");
    });
  });

  it("informa que as assinaturas ja feitas continuam validas", async () => {
    await abrirExclusao();

    const dialogo = screen.getByRole("dialog", { name: "Apagar a rubrica" });
    expect(dialogo).toHaveTextContent(/já fez continuam válidas/i);
    // E que o ato nao volta atras.
    expect(dialogo).toHaveTextContent(/não há como recuperá-la/i);
  });

  it("mostra o erro de senha errada sem fechar o dialogo nem apagar", async () => {
    const user = await abrirExclusao();
    vi.mocked(api.apagarRubrica).mockRejectedValue(
      new ApplicationError("Senha incorreta.", "autorizacao", 403),
    );

    await user.type(screen.getByLabelText("Confirme sua senha"), "senha-errada");
    await user.click(screen.getByRole("button", { name: "Apagar definitivamente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Senha incorreta.");
    expect(screen.getByRole("dialog", { name: "Apagar a rubrica" })).toBeInTheDocument();
    // A rubrica segue na tela: nada foi removido.
    expect(screen.getByAltText("Sua rubrica registrada")).toBeInTheDocument();
  });

  it("esquece a senha digitada ao cancelar", async () => {
    const user = await abrirExclusao();
    await user.type(screen.getByLabelText("Confirme sua senha"), "segredo");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Apagar rubrica" }));

    expect(screen.getByLabelText("Confirme sua senha")).toHaveValue("");
    expect(api.apagarRubrica).not.toHaveBeenCalled();
  });

  it("depois de apagar, o guarda volta a exigir o registro na proxima rota protegida", async () => {
    const user = userEvent.setup();
    vi.mocked(api.me).mockResolvedValueOnce(COM_RUBRICA).mockResolvedValue(SEM_RUBRICA);

    render(<Arvore />);
    await screen.findByAltText("Sua rubrica registrada");
    await user.click(screen.getByRole("button", { name: "Apagar rubrica" }));
    await user.type(screen.getByLabelText("Confirme sua senha"), "senha-boa");
    await user.click(screen.getByRole("button", { name: "Apagar definitivamente" }));

    // A propria tela do perfil nao expulsa: fica e passa a convidar ao registro.
    expect(
      await screen.findByRole("heading", { name: /ainda não registrou uma rubrica/i }),
    ).toBeInTheDocument();

    // Mas a proxima rota protegida volta a exigir o registro.
    await user.click(screen.getByRole("link", { name: "Voltar ao acervo" }));

    expect(
      await screen.findByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeInTheDocument();
  });
});

// --- fronteira -----------------------------------------------------------------------

describe("fronteira de dados", () => {
  it("nenhuma chamada da tela envia id de usuario", async () => {
    const user = userEvent.setup();
    render(<Arvore />);
    await screen.findByAltText("Sua rubrica registrada");
    await user.click(screen.getByRole("button", { name: "Apagar rubrica" }));
    await user.type(screen.getByLabelText("Confirme sua senha"), "senha-boa");
    await user.click(screen.getByRole("button", { name: "Apagar definitivamente" }));
    await waitFor(() => {
      expect(api.apagarRubrica).toHaveBeenCalled();
    });

    // A leitura nao recebe argumento algum, e a exclusao so a senha: o recurso e
    // sempre /me/signature, nunca /users/{id}/signature.
    expect(vi.mocked(api.baixarRubrica).mock.calls[0]).toEqual([]);
    expect(vi.mocked(api.apagarRubrica).mock.calls[0]).toEqual(["senha-boa"]);
    const enviado = JSON.stringify(vi.mocked(api.apagarRubrica).mock.calls);
    expect(enviado).not.toContain(COM_RUBRICA.id);
  });
});
