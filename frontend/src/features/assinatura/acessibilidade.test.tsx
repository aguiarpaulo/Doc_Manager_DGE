/**
 * Acessibilidade da jornada de assinatura.
 *
 * Três camadas, porque nenhuma sozinha cobre o contrato:
 *
 * 1. **axe** sobre as telas renderizadas — pega rótulo ausente, papel errado,
 *    `aria-*` inválido. Sob jsdom a regra de contraste é desativada, então o axe
 *    aqui **não** diz nada sobre cor.
 * 2. **contraste calculado dos tokens** — o que o axe não pode fazer neste
 *    ambiente é feito pela fórmula da WCAG sobre as combinações aprovadas.
 * 3. **teclado**, exercitado como interação real.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AssinaturaAplicada,
  Documento,
  SolicitacaoAssinatura,
  Usuario,
} from "../../data/contracts.ts";
import { contraste, lerTokens } from "../../test/contraste.ts";
// `?raw` em vez de leitura do disco: independe do diretorio de execucao.
import cssGlobal from "../../styles/index.css?raw";
import cssShell from "../obras/shell.css?raw";
import cssAssinatura from "./assinatura.css?raw";
import { AuthProvider } from "../auth/AuthContext.tsx";
import { RotaProtegida } from "../auth/RotaProtegida.tsx";
import { RegistroRubricaPage } from "../rubrica/RegistroRubricaPage.tsx";
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

async function auditar(container: HTMLElement) {
  const resultado = await axe.run(container, {
    // Regras que exigem contexto de página inteira não se aplicam a um fragmento.
    rules: {
      region: { enabled: false },
      "page-has-heading-one": { enabled: false },
    },
  });
  return resultado.violations;
}

function descrever(violacoes: axe.Result[]): string {
  return violacoes
    .map((v) => `${v.id}: ${v.help} (${String(v.nodes.length)} nó(s))`)
    .join("\n");
}

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  window.sessionStorage.setItem("ged.sessao.refresh", "r");
  vi.mocked(api.refresh).mockResolvedValue({ access_token: "a" });
  vi.mocked(api.me).mockResolvedValue(BRUNO);
  vi.mocked(api.obterDocumento).mockResolvedValue(DOCUMENTO);
  vi.mocked(api.listarSolicitacoes).mockResolvedValue([PENDENCIA]);
  vi.mocked(api.listarAssinaturas).mockResolvedValue([]);
  vi.mocked(api.assinarSolicitacao).mockResolvedValue(ASSINATURA);
  vi.mocked(api.registrarRubrica).mockResolvedValue({
    id: "r-1",
    tipo: "image/png",
    tamanho: 100,
    hash: "a".repeat(64),
    atualizado_em: "2026-08-19T12:00:00Z",
  });
});

function ArvoreAssinar() {
  return (
    <MemoryRouter initialEntries={["/documentos/d-1/assinar"]}>
      <AuthProvider>
        <Routes>
          <Route element={<RotaProtegida />}>
            <Route path="/documentos/:documentoId/assinar" element={<AssinarDocumentoPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

function ArvoreRubrica() {
  vi.mocked(api.me).mockResolvedValue({ ...BRUNO, has_signature: false });
  return (
    <MemoryRouter initialEntries={["/rubrica"]}>
      <AuthProvider>
        <Routes>
          <Route element={<RotaProtegida />}>
            <Route path="/rubrica" element={<RegistroRubricaPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

// --- auditoria automatizada ------------------------------------------------------


describe("auditoria com axe", () => {
  it("a tela de assinatura nao acusa violacao", async () => {
    const { container } = render(<ArvoreAssinar />);
    await screen.findByRole("heading", { name: "Assinar documento" });

    const violacoes = await auditar(container);

    expect(descrever(violacoes)).toBe("");
  });

  it("o modal de confirmacao nao acusa violacao", async () => {
    const user = userEvent.setup();
    render(<ArvoreAssinar />);
    await user.click(await screen.findByRole("button", { name: "Assinar documento" }));

    // Audita o diálogo onde ele realmente vive: no portal, fora do container.
    const violacoes = await auditar(document.body);

    expect(descrever(violacoes)).toBe("");
  });

  it("a tela de registro da rubrica nao acusa violacao", async () => {
    const { container } = render(<ArvoreRubrica />);
    await screen.findByRole("heading", { name: "Registre a sua rubrica" });

    const violacoes = await auditar(container);

    expect(descrever(violacoes)).toBe("");
  });
});

// --- teclado ---------------------------------------------------------------------


describe("jornada por teclado", () => {
  it("assina do inicio ao fim sem usar o mouse", async () => {
    const user = userEvent.setup();
    render(<ArvoreAssinar />);
    await screen.findByRole("heading", { name: "Assinar documento" });

    // Chega ao botão tabulando, sem clicar em nada.
    const abrir = screen.getByRole("button", { name: "Assinar documento" });
    await user.tab();
    while (document.activeElement !== abrir) {
      await user.tab();
      if (document.activeElement === document.body) break;
    }
    expect(document.activeElement).toBe(abrir);

    await user.keyboard("{Enter}");
    const dialogo = await screen.findByRole("dialog");

    // O foco já está dentro do diálogo; digita e confirma pelo teclado.
    await user.keyboard("s3cret-pass");
    expect(within(dialogo).getByLabelText("Senha")).toHaveValue("s3cret-pass");

    vi.mocked(api.listarAssinaturas).mockResolvedValue([ASSINATURA]);
    const confirmar = within(dialogo).getByRole("button", {
      name: "Confirmar assinatura",
    });
    confirmar.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(api.assinarSolicitacao).toHaveBeenCalled();
    });
  });

  it("o foco visivel nunca e removido sem substituto", () => {
    const css = cssGlobal;

    // Se `outline: none` existir, tem de haver um substituto declarado.
    expect(css).toContain(":focus-visible");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px/);
  });
});

// --- controles por icone ----------------------------------------------------------


describe("controles por icone", () => {
  it("nenhum controle fica sem nome acessivel", async () => {
    const user = userEvent.setup();
    render(<ArvoreAssinar />);
    await screen.findByRole("heading", { name: "Assinar documento" });
    await user.click(screen.getByRole("button", { name: "Assinar documento" }));

    const controles = [
      ...screen.getAllByRole("button"),
      ...screen.queryAllByRole("link"),
      ...screen.queryAllByRole("textbox"),
    ];

    for (const controle of controles) {
      const nome = (
        controle.textContent ??
        controle.getAttribute("aria-label") ??
        ""
      ).trim();
      expect(nome, `controle sem nome: ${controle.outerHTML.slice(0, 80)}`).not.toBe("");
    }
  });
});

// --- contraste --------------------------------------------------------------------


describe("contraste dos tokens", () => {
  const tokens = lerTokens();

  /** Combinações aprovadas: par de tokens + razão mínima exigida. */
  const COMBINACOES: ReadonlyArray<
    readonly [frente: string, fundo: string, minimo: number, descricao: string]
  > = [
    ["--color-text-primary", "--color-background", 4.5, "texto sobre a página"],
    ["--color-text-primary", "--color-surface", 4.5, "texto sobre superfície"],
    ["--color-text-secondary", "--color-surface", 4.5, "texto secundário"],
    ["--color-text-secondary", "--color-surface-muted", 4.5, "texto em painel"],
    ["--color-action", "--color-surface", 4.5, "link e foco sobre superfície"],
    ["--color-action-text", "--color-action", 4.5, "texto em botão preenchido"],
    ["--color-danger-text", "--color-danger", 4.5, "texto em botão de risco"],
    ["--color-success", "--color-surface", 4.5, "estado aprovado"],
    ["--color-warning", "--color-surface", 4.5, "estado de atenção"],
    ["--color-danger", "--color-surface", 4.5, "estado rejeitado"],
  ];

  it.each(COMBINACOES)(
    "%s sobre %s atende WCAG AA (%s:1) — %s",
    (frente, fundo, minimo) => {
      const a = tokens[frente];
      const b = tokens[fundo];
      expect(a, `token ${frente} não encontrado`).toBeDefined();
      expect(b, `token ${fundo} não encontrado`).toBeDefined();

      const razao = contraste(a!, b!);
      expect(
        razao,
        `${frente} sobre ${fundo}: ${razao.toFixed(2)}:1 (mínimo ${String(minimo)}:1)`,
      ).toBeGreaterThanOrEqual(minimo);
    },
  );

  it("o acento institucional mantem 7:1 sobre branco, como documentado", () => {
    // A decisão registrada era 7:1 — segura até em texto pequeno.
    expect(contraste(tokens["--color-action"]!, "#ffffff")).toBeGreaterThanOrEqual(7);
  });
});

// --- cor nao e o unico sinal, e movimento -------------------------------------------


describe("cor e movimento", () => {
  const css = cssGlobal;

  it("respeita prefers-reduced-motion", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toMatch(/animation-duration:\s*0\.01ms/);
  });

  it("o item selecionado da lista nao depende so de cor", () => {
    const shell = cssShell;
    // aria-current marca o estado programaticamente, e a borda e o peso da
    // fonte o marcam visualmente.
    expect(shell).toContain('[aria-current="true"]');
    expect(shell).toMatch(/\[aria-current="true"\][^}]*border-left/);
    expect(shell).toMatch(/\[aria-current="true"\][^}]*font-weight/);
  });

  it("a area marcada no PDF usa borda tracejada alem da cor", () => {
    const assinatura = cssAssinatura;
    expect(assinatura).toMatch(/\.visualizador-pdf__area[^}]*border:[^;]*dashed/);
  });
});
