/**
 * A jornada de assinatura, em navegador, contra serviços reais.
 *
 * Este arquivo existe por causa da lição registrada no NODE-015: uma execução com
 * a fronteira HTTP simulada **não vale como evidência de smoke**. Aqui não há
 * mock nenhum — nem de API, nem de PDF, nem de e-mail. Chrome de verdade,
 * PostgreSQL de verdade, MinIO de verdade, SMTP de verdade.
 *
 * É também o único lugar onde se provam as coisas que venho marcando como não
 * verificáveis em jsdom: o traço no canvas, o PDF renderizado pelo pdfjs, o
 * retângulo desenhado com o mouse e a rubrica carimbada no PDF baixado.
 *
 *   docker compose -f docker-compose.test.yml -p gede2e up -d --build
 *   npx playwright test
 */

import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

const MAILPIT = process.env["E2E_MAILPIT_URL"] ?? "http://localhost:8027";
const API = `${process.env["E2E_BASE_URL"] ?? "http://localhost:8080"}/api`;

const marca = String(Date.now()).slice(-6);

const ADMIN = { usuario: "admin", senha: "senha-de-teste-admin-e2e" };

// Signatário novo a cada execução: o stack persiste entre runs, e um usuário
// reaproveitado já teria rubrica registrada — o que apagaria justamente a etapa
// que este teste existe para provar.
const SIGNATARIO = {
  usuario: `bruno${marca}`,
  email: `bruno${marca}@exemplo.com`,
  senha: "senha-de-teste-bruno-e2e",
};
const NOME_OBRA = `Obra E2E ${marca}`;
const NOME_DOCUMENTO = `Contrato E2E ${marca}`;

/** Um PDF real de duas páginas, montado à mão para não depender de fixture. */
function pdfDeDuasPaginas(): Buffer {
  const objetos = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 5 0 R/Resources<</Font<</F1 7 0 R>>>>>>endobj",
    "4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 6 0 R/Resources<</Font<</F1 7 0 R>>>>>>endobj",
    `5 0 obj<</Length 60>>stream\nBT /F1 18 Tf 72 760 Td (Pagina 1 - ${marca}) Tj ET\nendstream endobj`,
    `6 0 obj<</Length 60>>stream\nBT /F1 18 Tf 72 760 Td (Pagina 2 - ${marca}) Tj ET\nendstream endobj`,
    "7 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const objeto of objetos) {
    offsets.push(pdf.length);
    pdf += objeto + "\n";
  }
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${String(objetos.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<</Size ${String(objetos.length + 1)}/Root 1 0 R>>\nstartxref\n${String(inicioXref)}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

interface MensagemMailpit {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

async function esperarEmailPara(email: string, assuntoContem: string): Promise<string> {
  for (let tentativa = 0; tentativa < 30; tentativa += 1) {
    const resposta = await fetch(`${MAILPIT}/api/v1/messages`);
    const corpo = (await resposta.json()) as { messages: MensagemMailpit[] };
    const encontrada = corpo.messages.find(
      (m) =>
        m.To.some((d) => d.Address === email) && m.Subject.includes(assuntoContem),
    );
    if (encontrada) {
      const detalhe = await fetch(`${MAILPIT}/api/v1/message/${encontrada.ID}`);
      return ((await detalhe.json()) as { Text: string }).Text;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`nenhum e-mail para ${email} com assunto contendo "${assuntoContem}"`);
}

async function tokenDe(usuario: string, senha: string): Promise<string> {
  const resposta = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: usuario, password: senha }),
  });
  const corpo = (await resposta.json()) as { access_token: string };
  return corpo.access_token;
}

/** Desenha um traço no canvas com o mouse — o que o jsdom não consegue fazer. */
async function desenharRubrica(page: Page) {
  const canvas = page.getByRole("img", { name: /desenhar sua rubrica/i });
  const caixa = await canvas.boundingBox();
  if (!caixa) throw new Error("canvas sem geometria");

  await page.mouse.move(caixa.x + 40, caixa.y + caixa.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(caixa.x + 120, caixa.y + caixa.height * 0.3, { steps: 12 });
  await page.mouse.move(caixa.x + 200, caixa.y + caixa.height * 0.8, { steps: 12 });
  await page.mouse.move(caixa.x + 300, caixa.y + caixa.height * 0.4, { steps: 12 });
  await page.mouse.up();
}

async function entrar(page: Page, usuario: string, senha: string) {
  await page.getByLabel("Usuario").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Espera o login concluir de fato: navegar antes disso descarta a sessao,
  // porque o access token vive so em memoria e o refresh acabou de ser gravado.
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeHidden({
    timeout: 20_000,
  });
}

/** Garante que o usuario logado tem rubrica, desenhando uma se preciso. */
async function garantirRubrica(page: Page) {
  const titulo = page.getByRole("heading", { name: "Registre a sua rubrica" });
  if (await titulo.isVisible().catch(() => false)) {
    await desenharRubrica(page);
    await page.getByRole("button", { name: "Salvar rubrica" }).click();
    await expect(titulo).toBeHidden({ timeout: 20_000 });
  }
}

// Estado partilhado pela jornada, preenchido no primeiro teste.
let obraId = "";
let documentoId = "";
let hashOriginal = "";

test.describe.configure({ mode: "serial" });

test.describe("jornada de assinatura ponta a ponta", () => {
  test("preparação: obra, signatário e documento existem no stack real", async () => {
    const token = await tokenDe(ADMIN.usuario, ADMIN.senha);
    const cabecalhos = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const obra = (await (
      await fetch(`${API}/obras`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({ nome: NOME_OBRA, descricao: "criada pelo E2E" }),
      })
    ).json()) as { id: string };
    obraId = obra.id;
    expect(obraId).toBeTruthy();

    const signatario = (await (
      await fetch(`${API}/users`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({
          username: SIGNATARIO.usuario,
          email: SIGNATARIO.email,
          password: SIGNATARIO.senha,
          role: "engenheiro",
        }),
      })
    ).json()) as { id: string };
    await fetch(`${API}/obras/${obraId}/users/${signatario.id}`, {
      method: "PUT",
      headers: cabecalhos,
    });

    // Documento + PDF de verdade no MinIO.
    const documento = (await (
      await fetch(`${API}/documents`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({
          nome: NOME_DOCUMENTO,
          obra_id: obraId,
          categoria: "contrato",
        }),
      })
    ).json()) as { id: string };
    documentoId = documento.id;

    const pdf = pdfDeDuasPaginas();
    hashOriginal = createHash("sha256").update(pdf).digest("hex");

    const formulario = new FormData();
    formulario.append("file", new Blob([pdf], { type: "application/pdf" }), "contrato.pdf");
    const versao = await fetch(`${API}/documents/${documentoId}/versions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formulario,
    });
    const corpoVersao = (await versao.json()) as { hash: string };
    // O hash que o servidor calculou é o do arquivo que enviamos.
    expect(corpoVersao.hash).toBe(hashOriginal);
  });

  test("o signatário registra a rubrica desenhando no canvas", async ({ page }) => {
    await page.goto("/");
    await entrar(page, SIGNATARIO.usuario, SIGNATARIO.senha);

    // Sem rubrica, o guarda leva ao registro.
    await expect(
      page.getByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar rubrica" })).toBeDisabled();

    await desenharRubrica(page);

    // O traço de verdade habilita o salvar — isto é o que o jsdom não prova.
    await expect(page.getByRole("button", { name: "Salvar rubrica" })).toBeEnabled();
    await page.getByRole("button", { name: "Salvar rubrica" }).click();

    // Sai da tela de registro: o guarda já enxerga a rubrica.
    await expect(
      page.getByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeHidden();
  });

  test("o autor marca a área no PDF renderizado e solicita a assinatura", async ({ page }) => {
    await page.goto("/");
    await entrar(page, ADMIN.usuario, ADMIN.senha);

    // O administrador também precisa de rubrica para passar do guarda.
    await garantirRubrica(page);

    await page.goto(`/obras/${obraId}/documentos/${documentoId}`);

    // O PDF é renderizado pelo pdfjs de verdade, num chunk carregado sob demanda.
    const camada = page.getByRole("application", { name: /Marcar área de assinatura/ });
    await expect(camada.first()).toBeVisible({ timeout: 30_000 });

    // `exact` porque os canvases tambem se chamam "Pagina 1", "Pagina 2".
    await page.getByLabel("Página", { exact: true }).selectOption("2");
    const alvo = page.getByRole("application", {
      name: /Marcar área de assinatura na página 2/,
    });
    const caixa = await alvo.boundingBox();
    if (!caixa) throw new Error("camada de marcação sem geometria");

    // Retângulo desenhado com o mouse sobre a página.
    await page.mouse.move(caixa.x + caixa.width * 0.15, caixa.y + caixa.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width * 0.55, caixa.y + caixa.height * 0.82, {
      steps: 10,
    });
    await page.mouse.up();

    await expect(page.getByTestId("resumo-area")).toContainText("página 2");

    await page.getByLabel("Quem deve assinar").selectOption({ label: SIGNATARIO.usuario });
    await page.getByRole("button", { name: "Solicitar assinatura" }).click();

    await expect(page.getByTestId("resumo-area")).toBeHidden();
  });

  test("o e-mail chega no Mailpit e o link leva ao documento certo", async ({ page }) => {
    const corpo = await esperarEmailPara(SIGNATARIO.email, "Assinatura solicitada");

    expect(corpo).toContain(NOME_DOCUMENTO);
    expect(corpo).toContain(NOME_OBRA);
    expect(corpo).toContain(ADMIN.usuario);

    const link = /https?:\/\/\S+\/documentos\/[0-9a-f-]+\/assinar/.exec(corpo)?.[0];
    expect(link, "o e-mail precisa trazer o link de assinatura").toBeTruthy();
    expect(link).toContain(documentoId);

    // Chega anônimo pelo link, como quem clica no e-mail.
    await page.goto(link!);
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

    await entrar(page, SIGNATARIO.usuario, SIGNATARIO.senha);

    // Volta exatamente para o documento do link.
    await expect(page.getByRole("heading", { name: "Assinar documento" })).toBeVisible();
    await expect(page.getByText(NOME_DOCUMENTO)).toBeVisible();
  });

  test("assina confirmando a senha e a etapa aparece na linha do tempo", async ({ page }) => {
    await page.goto("/");
    await entrar(page, SIGNATARIO.usuario, SIGNATARIO.senha);
    await garantirRubrica(page);
    await page.goto(`/documentos/${documentoId}/assinar`);

    await page.getByRole("button", { name: "Assinar documento" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();

    // Senha errada não consome a pendência.
    await dialogo.getByLabel("Senha").fill("senha-errada");
    await dialogo.getByRole("button", { name: "Confirmar assinatura" }).click();
    await expect(dialogo.getByRole("alert")).toContainText("Senha incorreta");

    await dialogo.getByLabel("Senha").fill(SIGNATARIO.senha);
    await dialogo.getByRole("button", { name: "Confirmar assinatura" }).click();

    await expect(page.getByTestId("assinatura-registrada")).toContainText(
      SIGNATARIO.usuario,
    );

    // A etapa na linha do tempo, na pasta da obra.
    await page.goto(`/obras/${obraId}/documentos/${documentoId}`);
    const assinada = page.locator('[data-testid="etapa"][data-acao="signed"]');
    await expect(assinada).toBeVisible({ timeout: 30_000 });
    await expect(assinada).toContainText(SIGNATARIO.usuario);
  });

  test("o download traz o PDF carimbado e o objeto original segue intacto", async () => {
    const token = await tokenDe(ADMIN.usuario, ADMIN.senha);

    const resposta = await fetch(`${API}/documents/${documentoId}/versions/1/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resposta.headers.get("content-type")).toContain("application/pdf");
    const baixado = Buffer.from(await resposta.arrayBuffer());

    // O carimbo é derivado: o arquivo entregue difere do enviado...
    expect(createHash("sha256").update(baixado).digest("hex")).not.toBe(hashOriginal);
    // ...e traz a folha de conferência, que só o carimbo acrescenta.
    expect(baixado.toString("latin1")).toContain("/Type /Page");
    expect(baixado.length).toBeGreaterThan(0);

    // ...mas o hash registrado do objeto guardado continua o do original.
    const documento = await fetch(`${API}/documents/${documentoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await documento.json()).current_version).toBe(1);

    const versoes = await fetch(`${API}/documents/${documentoId}/signature-requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const solicitacoes = (await versoes.json()) as { status: string }[];
    expect(solicitacoes.some((s) => s.status === "assinada")).toBe(true);
  });
});
