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
import { PerfilRubricaPage } from "../rubrica/PerfilRubricaPage.tsx";
import { RegistroRubricaPage } from "../rubrica/RegistroRubricaPage.tsx";
import { AssinarDocumentoPage } from "./AssinarDocumentoPage.tsx";

vi.mock("../../data/api.ts");
const api = await import("../../data/api.ts");

// A tela de assinatura passou a renderizar o PDF (NODE-045).
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 595, height: 842 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
    }),
  })),
}));

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
  vi.mocked(api.baixarVersao).mockResolvedValue({
    blob: new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" }),
    contentType: "application/pdf",
  });
  vi.mocked(api.registrarRubrica).mockResolvedValue({
    id: "r-1",
    tipo: "image/png",
    tamanho: 100,
    hash: "a".repeat(64),
    atualizado_em: "2026-08-19T12:00:00Z",
  });
  vi.mocked(api.recusarSolicitacao).mockResolvedValue({
    ...PENDENCIA,
    status: "recusada",
    motivo: "Valor divergente na clausula 4.",
    encerrado_em: "2026-08-19T14:00:00Z",
  });
  vi.mocked(api.baixarRubrica).mockResolvedValue({
    blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    contentType: "image/png",
  });
  vi.mocked(api.apagarRubrica).mockResolvedValue(undefined);
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

function ArvorePerfil() {
  return (
    <MemoryRouter initialEntries={["/perfil/rubrica"]}>
      <AuthProvider>
        <Routes>
          <Route element={<RotaProtegida />}>
            <Route path="/perfil/rubrica" element={<PerfilRubricaPage />} />
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

  it("a tela de perfil da rubrica nao acusa violacao", async () => {
    const { container } = render(<ArvorePerfil />);
    await screen.findByAltText("Sua rubrica registrada");

    const violacoes = await auditar(container);

    expect(descrever(violacoes)).toBe("");
  });

  it("o dialogo de exclusao da rubrica nao acusa violacao", async () => {
    const user = userEvent.setup();
    render(<ArvorePerfil />);
    await user.click(await screen.findByRole("button", { name: "Apagar rubrica" }));

    const violacoes = await auditar(document.body);

    expect(descrever(violacoes)).toBe("");
  });

  it("o dialogo de recusa nao acusa violacao", async () => {
    const user = userEvent.setup();
    render(<ArvoreAssinar />);
    await user.click(await screen.findByRole("button", { name: "Recusar assinatura" }));

    const violacoes = await auditar(document.body);

    expect(descrever(violacoes)).toBe("");
  });
});

// --- foco no dialogo de exclusao ---------------------------------------------------


describe("dialogo de exclusao da rubrica", () => {
  it("move o foco para dentro ao abrir", async () => {
    const user = userEvent.setup();
    render(<ArvorePerfil />);
    await user.click(await screen.findByRole("button", { name: "Apagar rubrica" }));

    const dialogo = screen.getByRole("dialog", { name: "Apagar a rubrica" });
    expect(dialogo.contains(document.activeElement)).toBe(true);
    // O primeiro focavel e o campo de senha: quem abre ja pode digitar.
    expect(document.activeElement).toBe(screen.getByLabelText("Confirme sua senha"));
  });

  it("prende o Tab dentro do dialogo", async () => {
    const user = userEvent.setup();
    render(<ArvorePerfil />);
    await user.click(await screen.findByRole("button", { name: "Apagar rubrica" }));
    // Com a senha preenchida os tres focaveis existem, e o ciclo e observavel.
    await user.type(screen.getByLabelText("Confirme sua senha"), "s3cret");

    const dialogo = screen.getByRole("dialog", { name: "Apagar a rubrica" });
    const apagar = within(dialogo).getByRole("button", {
      name: "Apagar definitivamente",
    });
    apagar.focus();

    await user.tab();

    // Do ultimo volta ao primeiro, sem escapar para o fundo.
    expect(dialogo.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Confirme sua senha"));
  });

  it("fecha com Escape e devolve o foco a quem o abriu", async () => {
    const user = userEvent.setup();
    render(<ArvorePerfil />);
    const abrir = await screen.findByRole("button", { name: "Apagar rubrica" });
    await user.click(abrir);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Apagar a rubrica" }),
      ).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(abrir);
    // Escapar nao apaga nada.
    expect(api.apagarRubrica).not.toHaveBeenCalled();
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

  it("recusa do inicio ao fim sem usar o mouse", async () => {
    const user = userEvent.setup();
    render(<ArvoreAssinar />);
    await screen.findByRole("heading", { name: "Assinar documento" });

    const abrir = screen.getByRole("button", { name: "Recusar assinatura" });
    await user.tab();
    while (document.activeElement !== abrir) {
      await user.tab();
      if (document.activeElement === document.body) break;
    }
    expect(document.activeElement).toBe(abrir);

    await user.keyboard("{Enter}");
    const dialogo = await screen.findByRole("dialog", { name: "Recusar a assinatura" });

    // O foco cai no textarea: digitar o motivo nao exige nenhuma tabulacao.
    expect(document.activeElement).toBe(within(dialogo).getByLabelText("Motivo"));
    await user.keyboard("Valor divergente na clausula 4.");

    const confirmar = within(dialogo).getByRole("button", { name: "Confirmar recusa" });
    confirmar.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(api.recusarSolicitacao).toHaveBeenCalledWith(
        "d-1",
        "s-1",
        "Valor divergente na clausula 4.",
      );
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

  /**
   * Tokens que não carregam texto e por isso não entram em COMBINACOES. Cada um
   * traz o motivo: a isenção é uma decisão registrada, não um esquecimento.
   */
  const SEM_TEXTO: Readonly<Record<string, string>> = {
    "--color-border": "divisória decorativa; não identifica controle (1.4.11 não se aplica)",
    "--color-border-strong": "borda de componente; verificada como não-texto a 3:1",
    "--color-focus": "anel de foco; verificado como não-texto a 3:1",
    "--color-action-hover": "estado transitório do mesmo link já coberto",
    "--color-overlay": "escurecimento do fundo do modal; rgba, não carrega texto",
  };

  it.each([
    ["--color-focus", "--color-background", "anel de foco sobre a página"],
    ["--color-border-strong", "--color-surface", "borda de campo, canvas e modal"],
  ])("%s sobre %s atende 3:1 para elemento nao textual — %s", (frente, fundo) => {
    // WCAG 1.4.11: componente de interface e gráfico exigem 3:1, não 4.5:1.
    expect(contraste(tokens[frente]!, tokens[fundo]!)).toBeGreaterThanOrEqual(3);
  });

  it("a borda decorativa e a de componente sao tokens distintos", () => {
    // Se voltarem a ser o mesmo valor, a distinção que sustenta a isenção acima
    // deixou de existir e o teste de 3:1 passaria a mentir sobre as divisórias.
    expect(tokens["--color-border"]).not.toBe(tokens["--color-border-strong"]);
  });

  it("todo token de cor esta coberto ou isento com motivo", () => {
    const cobertos = new Set(COMBINACOES.flatMap(([frente, fundo]) => [frente, fundo]));
    const declarados = Object.keys(tokens).filter((t) => t.startsWith("--color-"));

    // Um token novo que ninguém aprovou nem isentou reprova aqui. É isto que
    // impede a lista de combinações de envelhecer em silêncio.
    const orfaos = declarados.filter(
      (t) => !cobertos.has(t) && !(t in SEM_TEXTO),
    );
    expect(orfaos, `tokens sem combinação aprovada nem isenção: ${orfaos.join(", ")}`)
      .toEqual([]);
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
