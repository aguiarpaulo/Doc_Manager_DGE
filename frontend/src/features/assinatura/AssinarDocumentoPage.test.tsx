import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AssinaturaAplicada,
  Documento,
  SolicitacaoAssinatura,
  Usuario,
} from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { AuthProvider } from "../auth/AuthContext.tsx";
import { LoginPage } from "../auth/LoginPage.tsx";
import { RotaProtegida } from "../auth/RotaProtegida.tsx";
import { AssinarDocumentoPage } from "./AssinarDocumentoPage.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

const BRUNO: Usuario = {
  id: "u-bruno",
  username: "bruno",
  email: "b@e.com",
  role: "engenheiro",
  is_active: true,
  has_signature: true,
};

const DOCUMENTO: Documento = {
  id: "d-1",
  nome: "Contrato principal",
  obra_id: "o-1",
  categoria: "contrato",
  status: "enviado",
  criado_por: "u-ana",
  criado_em: "2026-08-01T10:00:00Z",
  current_version: 1,
};

const PENDENCIA: SolicitacaoAssinatura = {
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
  page_width: 595,
  page_height: 842,
  status: "pendente",
  motivo: null,
  criado_em: "2026-08-19T12:00:00Z",
  encerrado_em: null,
};

const ASSINATURA: AssinaturaAplicada = {
  id: "a-1",
  signature_request_id: "s-1",
  document_id: "d-1",
  document_version_id: "v-1",
  signatario_id: "u-bruno",
  signatario_nome: "bruno",
  assinado_em: "2026-08-19T13:45:00Z",
};

const ROTA = "/documentos/d-1/assinar";

function Arvore({ inicial = ROTA }: { inicial?: string }) {
  return (
    <MemoryRouter initialEntries={[inicial]}>
      <AuthProvider>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />
          <Route element={<RotaProtegida />}>
            <Route path="/documentos/:documentoId/assinar" element={<AssinarDocumentoPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function abrirModal() {
  const user = userEvent.setup();
  render(<Arvore />);
  await user.click(await screen.findByRole("button", { name: "Assinar documento" }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.sessionStorage.setItem("ged.sessao.refresh", "r");
  vi.mocked(api.refresh).mockResolvedValue({ access_token: "a" });
  vi.mocked(api.me).mockResolvedValue(BRUNO);
  vi.mocked(api.obterDocumento).mockResolvedValue(DOCUMENTO);
  vi.mocked(api.listarSolicitacoes).mockResolvedValue([PENDENCIA]);
  vi.mocked(api.listarAssinaturas).mockResolvedValue([]);
  vi.mocked(api.assinarSolicitacao).mockResolvedValue(ASSINATURA);
});

// --- assinar --------------------------------------------------------------------------


describe("assinar", () => {
  it("com a senha correta conclui e a assinatura passa a aparecer com nome e horario", async () => {
    const user = await abrirModal();
    await user.type(screen.getByLabelText("Senha"), "s3cret-pass");

    vi.mocked(api.listarAssinaturas).mockResolvedValue([ASSINATURA]);
    vi.mocked(api.listarSolicitacoes).mockResolvedValue([
      { ...PENDENCIA, status: "assinada", encerrado_em: "2026-08-19T13:45:00Z" },
    ]);

    await user.click(screen.getByRole("button", { name: "Confirmar assinatura" }));

    await waitFor(() => {
      expect(api.assinarSolicitacao).toHaveBeenCalledWith("d-1", "s-1", "s3cret-pass");
    });
    const registrada = await screen.findByTestId("assinatura-registrada");
    expect(registrada).toHaveTextContent("bruno");
    // Nome e horário, como o contrato pede.
    expect(registrada.textContent ?? "").toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("com a senha errada mantem a pendencia e mostra erro acionavel", async () => {
    vi.mocked(api.assinarSolicitacao).mockRejectedValue(
      new ApplicationError("Senha incorreta.", "autorizacao", 403),
    );
    const user = await abrirModal();
    await user.type(screen.getByLabelText("Senha"), "errada");

    await user.click(screen.getByRole("button", { name: "Confirmar assinatura" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Senha incorreta.");
    // O diálogo continua aberto para nova tentativa: um erro de digitação não
    // pode consumir a pendência.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar assinatura" })).toBeEnabled();
  });

  it("desabilita o confirmar durante o envio, impedindo assinatura duplicada", async () => {
    let liberar: (v: AssinaturaAplicada) => void = () => {};
    vi.mocked(api.assinarSolicitacao).mockReturnValue(
      new Promise((resolve) => {
        liberar = resolve;
      }),
    );
    const user = await abrirModal();
    await user.type(screen.getByLabelText("Senha"), "s3cret-pass");

    await user.click(screen.getByRole("button", { name: "Confirmar assinatura" }));

    expect(await screen.findByRole("button", { name: "Assinando..." })).toBeDisabled();
    liberar(ASSINATURA);
  });

  it("nao habilita o confirmar com a senha vazia", async () => {
    await abrirModal();

    // Sessão aberta não basta: sem senha digitada não há confirmação.
    expect(screen.getByRole("button", { name: "Confirmar assinatura" })).toBeDisabled();
  });

  it("informa quando nao ha pendencia para o usuario", async () => {
    vi.mocked(api.listarSolicitacoes).mockResolvedValue([
      { ...PENDENCIA, signatario_id: "outra-pessoa" },
    ]);

    render(<Arvore />);

    expect(
      await screen.findByText(/Não há assinatura pendente para você/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Assinar documento" }),
    ).not.toBeInTheDocument();
  });
});

// --- o link do e-mail ------------------------------------------------------------------


describe("link do e-mail", () => {
  it("sem sessao passa pelo login e volta para a tela de assinatura do documento certo", async () => {
    // Sem refresh guardado: chega anônimo, como quem clica no link do e-mail.
    window.sessionStorage.clear();
    vi.mocked(api.refresh).mockRejectedValue(
      new ApplicationError("sem sessao", "autenticacao"),
    );
    vi.mocked(api.login).mockResolvedValue({
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
    });

    render(<Arvore inicial={ROTA} />);

    // Primeiro o login.
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Entrar" });
    await user.type(screen.getByLabelText("Usuario"), "bruno");
    await user.type(screen.getByLabelText("Senha"), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    // Depois, exatamente o documento do link — não a raiz.
    expect(
      await screen.findByRole("heading", { name: "Assinar documento" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(api.obterDocumento).toHaveBeenCalledWith("d-1", expect.anything());
    });
  });
});

// --- o modal --------------------------------------------------------------------------


describe("modal de confirmacao", () => {
  it("move o foco para dentro ao abrir", async () => {
    await abrirModal();

    const dialogo = screen.getByRole("dialog");
    await waitFor(() => {
      expect(dialogo.contains(document.activeElement)).toBe(true);
    });
  });

  it("tem papel, modalidade e titulo associado", async () => {
    await abrirModal();

    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toHaveAccessibleName("Confirme sua senha para assinar");
  });

  it("prende o Tab dentro do dialogo", async () => {
    const user = await abrirModal();
    const dialogo = screen.getByRole("dialog");
    const focaveis = within(dialogo).getAllByRole("button");
    const ultimo = focaveis[focaveis.length - 1]!;

    ultimo.focus();
    await user.tab();

    // Do último volta para dentro, nunca para o fundo.
    expect(dialogo.contains(document.activeElement)).toBe(true);
  });

  it("fecha com Escape e devolve o foco a quem o abriu", async () => {
    const user = await abrirModal();
    const abridor = screen.getByRole("button", { name: "Assinar documento" });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(abridor);
  });

  it("torna o fundo inerte enquanto esta aberto", async () => {
    const user = await abrirModal();

    // O conteúdo de fundo não deve ser alcançável por teclado nem por leitor:
    // todo irmão do portal fica inerte.
    const portal = screen.getByRole("dialog").closest(".modal__fundo");
    const fundo = Array.from(document.body.children).filter((f) => f !== portal);
    expect(fundo.length).toBeGreaterThan(0);
    expect(fundo.every((f) => f.hasAttribute("inert"))).toBe(true);

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(fundo.some((f) => f.hasAttribute("inert"))).toBe(false);
    });
  });
});

// --- a senha ---------------------------------------------------------------------------


describe("a senha", () => {
  it("nao e persistida no armazenamento do navegador", async () => {
    const user = await abrirModal();

    await user.type(screen.getByLabelText("Senha"), "s3cret-pass");

    expect(JSON.stringify(window.sessionStorage)).not.toContain("s3cret-pass");
    expect(JSON.stringify(window.localStorage)).not.toContain("s3cret-pass");
  });

  it("some do campo ao fechar o dialogo", async () => {
    const user = await abrirModal();
    await user.type(screen.getByLabelText("Senha"), "s3cret-pass");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Assinar documento" }));

    expect(screen.getByLabelText("Senha")).toHaveValue("");
  });

  it("usa campo de senha, para nao aparecer na tela nem em gravacao", async () => {
    await abrirModal();

    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
  });
});
