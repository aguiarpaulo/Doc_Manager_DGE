/**
 * O documento aparece na tela? Em pixels, não em elementos.
 *
 * Existe por um defeito que atravessou toda a construção sem ser notado: o
 * `VisualizadorPdf` procurava `canvas[data-pagina=N]` **enquanto o estado ainda
 * era "carregando"** — instante em que o componente só renderiza o parágrafo de
 * carga e nenhum canvas está montado. `render()` nunca era chamado e o usuário
 * via um retângulo branco. Nada pegou isso porque todo teste dublava `render` e
 * nenhum verificava se ele era chamado, e porque os E2E esperavam pela *camada de
 * marcação*, que existe mesmo com a página em branco.
 *
 * A lição está no nome do arquivo: para um visualizador, a asserção honesta é
 * sobre o que foi desenhado.
 *
 *   docker compose -f docker-compose.test.yml -p gede2e up -d --build
 *   npx playwright test
 */

import { expect, test, type Page } from "@playwright/test";

const API = `${process.env["E2E_BASE_URL"] ?? "http://localhost:8080"}/api`;

const marca = String(Date.now()).slice(-6);
const ADMIN = { usuario: "admin", senha: "senha-de-teste-admin-e2e" };
const LEITOR = {
  usuario: `leitor${marca}`,
  email: `leitor${marca}@exemplo.com`,
  senha: "senha-de-teste-leitor-e2e",
};
const NOME_OBRA = `Obra Leitura ${marca}`;
const NOME_DOCUMENTO = `Documento legivel ${marca}`;

/** PDF com um retângulo preto grande: garante tinta suficiente para medir. */
function pdfComMancha(): Buffer {
  const conteudo = "0 0 0 rg 80 200 440 500 re f";
  const objetos = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<<>>>>endobj",
    `4 0 obj<</Length ${String(conteudo.length)}>>stream\n${conteudo}\nendstream endobj`,
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

async function tokenDe(usuario: string, senha: string): Promise<string> {
  const resposta = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: usuario, password: senha }),
  });
  return ((await resposta.json()) as { access_token: string }).access_token;
}

async function entrar(page: Page, usuario: string, senha: string) {
  await page.goto("/");
  await page.getByLabel("Usuario").fill(usuario);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeHidden({
    timeout: 20_000,
  });
}

async function desenharRubrica(page: Page) {
  const caixa = await page
    .getByRole("img", { name: /desenhar sua rubrica/i })
    .boundingBox();
  if (!caixa) throw new Error("canvas sem geometria");
  await page.mouse.move(caixa.x + 40, caixa.y + caixa.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(caixa.x + 160, caixa.y + caixa.height * 0.3, { steps: 10 });
  await page.mouse.move(caixa.x + 280, caixa.y + caixa.height * 0.75, { steps: 10 });
  await page.mouse.up();
}

async function garantirRubrica(page: Page) {
  const titulo = page.getByRole("heading", { name: "Registre a sua rubrica" });
  if (await titulo.isVisible().catch(() => false)) {
    await desenharRubrica(page);
    await page.getByRole("button", { name: "Salvar rubrica" }).click();
    await expect(titulo).toBeHidden({ timeout: 20_000 });
  }
}

interface Medida {
  readonly canvas: string;
  readonly tamanhoPadrao: boolean;
  readonly opacos: number;
  readonly escuros: number;
}

/** Lê os pixels realmente desenhados na página 1. */
async function medirPagina(page: Page): Promise<Medida> {
  await page.locator('canvas[data-pagina="1"]').first().waitFor({ timeout: 30_000 });
  // O desenho é assíncrono: o canvas existe antes de receber a página.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const c = document.querySelector<HTMLCanvasElement>('canvas[data-pagina="1"]');
          return c ? c.width : 0;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(300);

  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-pagina="1"]');
    if (!canvas) throw new Error("sem canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sem contexto");
    const { width, height } = canvas;
    const dados = ctx.getImageData(0, 0, width, height).data;

    // Pixel transparente lê como preto. Contá-lo como tinta daria um falso
    // positivo justamente no caso que interessa: o canvas em branco.
    let opacos = 0;
    let escuros = 0;
    for (let i = 0; i < dados.length; i += 4) {
      if (dados[i + 3] === 0) continue;
      opacos += 1;
      const r = dados[i] ?? 255;
      const g = dados[i + 1] ?? 255;
      const b = dados[i + 2] ?? 255;
      if (r < 200 || g < 200 || b < 200) escuros += 1;
    }
    return {
      canvas: `${String(width)}x${String(height)}`,
      tamanhoPadrao: width === 300 && height === 150,
      opacos,
      escuros,
    };
  });
}

let obraId = "";
let documentoId = "";

test.describe.configure({ mode: "serial" });

test.describe("o PDF aparece na tela", () => {
  test("preparação: obra, leitor sem poder de solicitar, e um PDF com tinta", async () => {
    const token = await tokenDe(ADMIN.usuario, ADMIN.senha);
    const cabecalhos = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const obra = (await (
      await fetch(`${API}/obras`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({ nome: NOME_OBRA, descricao: "leitura de PDF" }),
      })
    ).json()) as { id: string };
    obraId = obra.id;

    const leitor = (await (
      await fetch(`${API}/users`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({
          username: LEITOR.usuario,
          email: LEITOR.email,
          password: LEITOR.senha,
          role: "engenheiro",
        }),
      })
    ).json()) as { id: string };
    await fetch(`${API}/obras/${obraId}/users/${leitor.id}`, {
      method: "PUT",
      headers: cabecalhos,
    });

    // Criado pelo ADMIN: o leitor não é o autor, então não pode solicitar
    // assinatura — e é por isso que ele recebe a prévia de leitura.
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

    const formulario = new FormData();
    formulario.append(
      "file",
      new Blob([pdfComMancha()], { type: "application/pdf" }),
      "legivel.pdf",
    );
    const versao = await fetch(`${API}/documents/${documentoId}/versions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formulario,
    });
    expect(versao.status).toBe(201);
  });

  test("quem só lê vê a página desenhada, não um retângulo branco", async ({ page }) => {
    await entrar(page, LEITOR.usuario, LEITOR.senha);
    await garantirRubrica(page);
    await page.goto(`/obras/${obraId}/documentos/${documentoId}`);

    const medida = await medirPagina(page);

    expect(medida.tamanhoPadrao, `canvas ficou no padrão: ${medida.canvas}`).toBe(false);
    expect(medida.opacos).toBeGreaterThan(10_000);
    // A mancha preta do PDF: sem ela o canvas está montado mas vazio.
    expect(medida.escuros).toBeGreaterThan(1_000);
  });

  test("a prévia não depende de plugin do navegador", async ({ page }) => {
    await entrar(page, LEITOR.usuario, LEITOR.senha);
    await page.goto(`/obras/${obraId}/documentos/${documentoId}`);
    await medirPagina(page);

    // `<object type="application/pdf">` delegava ao visualizador embutido; onde
    // ele não existe, o elemento cai no conteúdo alternativo e nada aparece.
    expect(await page.locator("object").count()).toBe(0);
    await expect(page.getByText(/Nao foi possivel exibir o PDF/)).toBeHidden();
  });

  test("quem pode marcar também vê a página desenhada", async ({ page }) => {
    await entrar(page, ADMIN.usuario, ADMIN.senha);
    await garantirRubrica(page);
    await page.goto(`/obras/${obraId}/documentos/${documentoId}`);

    const medida = await medirPagina(page);
    expect(medida.tamanhoPadrao).toBe(false);
    expect(medida.escuros).toBeGreaterThan(1_000);

    // E o documento é desenhado uma vez só: a prévia de leitura sai de cena
    // quando o visualizador de marcação já mostra a mesma página.
    expect(await page.locator('canvas[data-pagina="1"]').count()).toBe(1);
  });
});
