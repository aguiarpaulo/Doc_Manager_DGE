/**
 * Recusa de assinatura e exclusão da rubrica, em navegador, contra o stack real.
 *
 * Fecha as duas jornadas que a DEM-003 acrescentou e que até aqui só existiam
 * provadas com a fronteira HTTP simulada. Pela lição do NODE-015, isso não vale
 * como evidência: aqui não há mock nenhum — Chrome, PostgreSQL, MinIO e SMTP de
 * verdade.
 *
 * A pergunta central do segundo bloco é a promessa que a tela de registro faz por
 * escrito desde o NODE-034: apagar a rubrica **não** invalida assinatura já feita.
 * A forma de provar isso é medir o PDF carimbado antes e depois da exclusão e
 * exigir que sejam byte a byte o mesmo — o que só se sustenta porque cada
 * assinatura guarda a própria cópia do traço.
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

// Signatário novo a cada execução, pelo mesmo motivo do outro spec: um usuário
// reaproveitado já teria rubrica, e é justamente o ciclo registrar → assinar →
// apagar → ser exigido de novo que este arquivo existe para provar.
const SIGNATARIO = {
  usuario: `carla${marca}`,
  email: `carla${marca}@exemplo.com`,
  senha: "senha-de-teste-carla-e2e",
};
const NOME_OBRA = `Obra Recusa ${marca}`;
const DOC_ASSINADO = `Contrato assinado ${marca}`;
const DOC_RECUSADO = `Contrato recusado ${marca}`;
const MOTIVO = `Valor divergente na clausula 4 (${marca}).`;

/** Um PDF real de uma página, montado à mão para não depender de fixture. */
function pdfDeUmaPagina(rotulo: string): Buffer {
  const objetos = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    `4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 72 760 Td (${rotulo}) Tj ET\nendstream endobj`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
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
      (m) => m.To.some((d) => d.Address === email) && m.Subject.includes(assuntoContem),
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

async function desenharRubrica(page: Page) {
  const canvas = page.getByRole("img", { name: /desenhar sua rubrica/i });
  const caixa = await canvas.boundingBox();
  if (!caixa) throw new Error("canvas sem geometria");

  await page.mouse.move(caixa.x + 40, caixa.y + caixa.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(caixa.x + 130, caixa.y + caixa.height * 0.3, { steps: 12 });
  await page.mouse.move(caixa.x + 220, caixa.y + caixa.height * 0.8, { steps: 12 });
  await page.mouse.move(caixa.x + 320, caixa.y + caixa.height * 0.35, { steps: 12 });
  await page.mouse.up();
}

async function entrar(page: Page, usuario: string, senha: string) {
  await page.getByLabel("Usuario").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  // O access token vive só em memória: navegar antes do login concluir descarta
  // a sessão recém-criada.
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeHidden({
    timeout: 20_000,
  });
}

/** Garante que quem está logado tem rubrica, desenhando uma se preciso. */
async function garantirRubrica(page: Page) {
  const titulo = page.getByRole("heading", { name: "Registre a sua rubrica" });
  if (await titulo.isVisible().catch(() => false)) {
    await desenharRubrica(page);
    await page.getByRole("button", { name: "Salvar rubrica" }).click();
    await expect(titulo).toBeHidden({ timeout: 20_000 });
  }
}

async function baixarCarimbado(documentoId: string): Promise<Buffer> {
  const token = await tokenDe(ADMIN.usuario, ADMIN.senha);
  const resposta = await fetch(`${API}/documents/${documentoId}/versions/1/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(resposta.status).toBe(200);
  return Buffer.from(await resposta.arrayBuffer());
}

// Estado partilhado pela jornada, preenchido na preparação.
let obraId = "";
let docAssinadoId = "";
let docRecusadoId = "";
let hashCarimbadoAntes = "";

test.describe.configure({ mode: "serial" });

test.describe("recusa de assinatura e exclusão da rubrica", () => {
  test("preparação: obra, signatária e dois documentos com pendência", async () => {
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

    const signataria = (await (
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
    await fetch(`${API}/obras/${obraId}/users/${signataria.id}`, {
      method: "PUT",
      headers: cabecalhos,
    });

    // Dois documentos: um para assinar, outro para recusar. A assinatura do
    // primeiro é o que precisa sobreviver à exclusão da rubrica.
    for (const [nome, rotulo] of [
      [DOC_ASSINADO, "assinado"],
      [DOC_RECUSADO, "recusado"],
    ] as const) {
      const documento = (await (
        await fetch(`${API}/documents`, {
          method: "POST",
          headers: cabecalhos,
          body: JSON.stringify({ nome, obra_id: obraId, categoria: "contrato" }),
        })
      ).json()) as { id: string };
      if (rotulo === "assinado") docAssinadoId = documento.id;
      else docRecusadoId = documento.id;

      const formulario = new FormData();
      formulario.append(
        "file",
        new Blob([pdfDeUmaPagina(`Pagina do ${rotulo} - ${marca}`)], {
          type: "application/pdf",
        }),
        "contrato.pdf",
      );
      const versao = await fetch(`${API}/documents/${documento.id}/versions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formulario,
      });
      expect(versao.status).toBe(201);

      const solicitacao = await fetch(`${API}/documents/${documento.id}/signature-requests`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({
          signatario_id: signataria.id,
          pagina: 1,
          x: 0.15,
          y: 0.7,
          largura: 0.4,
          altura: 0.12,
          page_width: 595,
          page_height: 842,
        }),
      });
      expect(solicitacao.status).toBe(201);
    }

    expect(docAssinadoId).toBeTruthy();
    expect(docRecusadoId).toBeTruthy();
  });

  test("registra a rubrica e assina o primeiro documento", async ({ page }) => {
    await page.goto("/");
    await entrar(page, SIGNATARIO.usuario, SIGNATARIO.senha);

    // O guarda leva ao registro por não haver rubrica ainda.
    await expect(
      page.getByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeVisible();
    await desenharRubrica(page);
    await page.getByRole("button", { name: "Salvar rubrica" }).click();
    await expect(
      page.getByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeHidden({ timeout: 20_000 });

    await page.goto(`/documentos/${docAssinadoId}/assinar`);
    await page.getByRole("button", { name: "Assinar documento" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Senha").fill(SIGNATARIO.senha);
    await dialogo.getByRole("button", { name: "Confirmar assinatura" }).click();

    await expect(page.getByTestId("assinatura-registrada")).toContainText(
      SIGNATARIO.usuario,
    );

    // O carimbo desta assinatura é a referência para o teste de exclusão.
    const carimbado = await baixarCarimbado(docAssinadoId);
    hashCarimbadoAntes = createHash("sha256").update(carimbado).digest("hex");
    expect(hashCarimbadoAntes).toHaveLength(64);
  });

  test("recusa o segundo documento com justificativa, e a etapa entra na linha do tempo", async ({
    page,
  }) => {
    await page.goto("/");
    await entrar(page, SIGNATARIO.usuario, SIGNATARIO.senha);
    await page.goto(`/documentos/${docRecusadoId}/assinar`);

    await page.getByRole("button", { name: "Recusar assinatura" }).click();

    const dialogo = page.getByRole("dialog", { name: "Recusar a assinatura" });
    await expect(dialogo).toBeVisible();
    // Sem motivo não se recusa: a regra existe na API e na tela.
    await expect(dialogo.getByRole("button", { name: "Confirmar recusa" })).toBeDisabled();

    await dialogo.getByLabel("Motivo").fill(MOTIVO);
    await dialogo.getByRole("button", { name: "Confirmar recusa" }).click();

    // A pendência sai da tela.
    await expect(
      page.getByRole("button", { name: "Recusar assinatura" }),
    ).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText("Não há assinatura pendente para você")).toBeVisible();

    // A etapa, com o motivo, na pasta da obra.
    await page.goto(`/obras/${obraId}/documentos/${docRecusadoId}`);
    const recusada = page.locator('[data-testid="etapa"][data-acao="signature_declined"]');
    await expect(recusada).toBeVisible({ timeout: 30_000 });
    await expect(recusada).toContainText(SIGNATARIO.usuario);
    await expect(recusada).toContainText(MOTIVO);
  });

  test("o e-mail de recusa chega ao solicitante com o documento e o motivo", async () => {
    // Vai para quem PEDIU a assinatura, não para quem recusou.
    const corpo = await esperarEmailPara("admin@exemplo.com", "Assinatura recusada");

    expect(corpo).toContain(DOC_RECUSADO);
    expect(corpo).toContain(SIGNATARIO.usuario);
    expect(corpo).toContain(MOTIVO);
  });

  test("apaga a rubrica confirmando a senha, e a assinatura anterior segue intacta", async ({
    page,
  }) => {
    await page.goto("/");
    await entrar(page, SIGNATARIO.usuario, SIGNATARIO.senha);
    await page.goto("/perfil/rubrica");

    // A rubrica registrada aparece na tela.
    await expect(page.getByAltText("Sua rubrica registrada")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "Apagar rubrica" }).click();
    const dialogo = page.getByRole("dialog", { name: "Apagar a rubrica" });
    await expect(dialogo).toContainText("continuam válidas");

    // Senha errada não apaga.
    await dialogo.getByLabel("Confirme sua senha").fill("senha-errada");
    await dialogo.getByRole("button", { name: "Apagar definitivamente" }).click();
    await expect(dialogo.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByAltText("Sua rubrica registrada")).toBeVisible();

    await dialogo.getByLabel("Confirme sua senha").fill(SIGNATARIO.senha);
    await dialogo.getByRole("button", { name: "Apagar definitivamente" }).click();

    await expect(
      page.getByRole("heading", { name: /ainda não registrou uma rubrica/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("a assinatura anterior segue consultável e com a imagem intacta", async ({
    page,
  }) => {
    // Consultada por quem ainda tem acesso: a própria signatária, sem rubrica,
    // não passa do guarda — e é assim que o sistema deve se comportar. Cada teste
    // roda em contexto próprio, então esta aba já começa sem sessão.
    await page.goto("/");
    await entrar(page, ADMIN.usuario, ADMIN.senha);
    await garantirRubrica(page);

    await page.goto(`/obras/${obraId}/documentos/${docAssinadoId}`);
    const assinada = page.locator('[data-testid="etapa"][data-acao="signed"]');
    await expect(assinada).toBeVisible({ timeout: 30_000 });
    await expect(assinada).toContainText(SIGNATARIO.usuario);

    // E o PDF carimbado é byte a byte o mesmo de antes da exclusão. É isto que
    // prova que o snapshot é uma cópia própria, e não uma referência à rubrica de
    // perfil que acabou de ser apagada.
    const depois = await baixarCarimbado(docAssinadoId);
    expect(createHash("sha256").update(depois).digest("hex")).toBe(hashCarimbadoAntes);
  });

  test("depois de apagar, o guarda exige o registro de novo", async ({ page }) => {
    await page.goto("/");
    await entrar(page, SIGNATARIO.usuario, SIGNATARIO.senha);

    // Qualquer rota protegida volta a cair no registro.
    await expect(
      page.getByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto(`/obras/${obraId}`);
    await expect(
      page.getByRole("heading", { name: "Registre a sua rubrica" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
