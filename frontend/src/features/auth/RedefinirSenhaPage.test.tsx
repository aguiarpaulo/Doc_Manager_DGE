import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "../../data/errors.ts";
import { LoginPage } from "./LoginPage.tsx";
import { RedefinirSenhaPage } from "./RedefinirSenhaPage.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

function Arvore({ inicial }: { inicial: string }) {
  return (
    <MemoryRouter initialEntries={[inicial]}>
      <Routes>
        <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/esqueci-minha-senha" element={<p>recuperar senha</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const COM_TOKEN = "/redefinir-senha?token=abc123";

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  vi.mocked(api.resetPassword).mockResolvedValue(undefined);
});

describe("token na URL", () => {
  it("usa o token do link do e-mail, sem pedi-lo a quem chega", async () => {
    const user = userEvent.setup();
    render(<Arvore inicial={COM_TOKEN} />);

    // O token nunca aparece como campo: ele veio no link.
    expect(screen.queryByLabelText(/token/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-123");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "senha-nova-123");
    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));

    await waitFor(() => {
      expect(api.resetPassword).toHaveBeenCalledWith("abc123", "senha-nova-123");
    });
  });

  it("sem token explica o problema e leva de volta ao pedido", () => {
    render(<Arvore inicial="/redefinir-senha" />);

    expect(screen.getByRole("alert")).toHaveTextContent(/link .*(inválido|incompleto)/i);
    expect(screen.getByRole("link", { name: /pedir um novo link/i })).toHaveAttribute(
      "href",
      "/esqueci-minha-senha",
    );
    // Sem token não há o que enviar: o formulário nem aparece.
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });
});

describe("confirmação da senha", () => {
  it("não envia quando as senhas divergem", async () => {
    const user = userEvent.setup();
    render(<Arvore inicial={COM_TOKEN} />);

    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-123");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "outra-coisa");
    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não conferem/i);
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("mantem o envio desabilitado enquanto algum campo esta vazio", async () => {
    const user = userEvent.setup();
    render(<Arvore inicial={COM_TOKEN} />);

    const botao = screen.getByRole("button", { name: "Redefinir senha" });
    expect(botao).toBeDisabled();

    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-123");
    expect(botao).toBeDisabled();

    await user.type(screen.getByLabelText("Confirme a nova senha"), "senha-nova-123");
    expect(botao).toBeEnabled();
  });

  it("usa campos de senha, para nao expor o que se digita", () => {
    render(<Arvore inicial={COM_TOKEN} />);

    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Confirme a nova senha")).toHaveAttribute(
      "type",
      "password",
    );
  });
});

describe("resultado", () => {
  it("confirma o sucesso e oferece entrar com a senha nova", async () => {
    const user = userEvent.setup();
    render(<Arvore inicial={COM_TOKEN} />);

    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-123");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "senha-nova-123");
    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/senha .*redefinida/i);
    expect(screen.getByRole("link", { name: /entrar/i })).toHaveAttribute(
      "href",
      "/entrar",
    );
    // O formulário sai da tela: reenviar o mesmo token falharia.
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });

  it("token expirado mostra a mensagem da API e oferece pedir outro", async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetPassword).mockRejectedValue(
      new ApplicationError("Token invalido ou expirado.", "validacao", 400),
    );
    render(<Arvore inicial={COM_TOKEN} />);

    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-123");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "senha-nova-123");
    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Token invalido ou expirado.",
    );
    expect(
      screen.getByRole("link", { name: /pedir um novo link/i }),
    ).toBeInTheDocument();
  });

  it("desabilita o envio durante a operacao, impedindo duplicidade", async () => {
    const user = userEvent.setup();
    let liberar: () => void = () => undefined;
    vi.mocked(api.resetPassword).mockReturnValue(
      new Promise((resolve) => {
        liberar = () => {
          resolve(undefined);
        };
      }),
    );
    render(<Arvore inicial={COM_TOKEN} />);

    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-123");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "senha-nova-123");
    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));

    expect(await screen.findByRole("button", { name: "Redefinindo..." })).toBeDisabled();
    liberar();
  });
});
