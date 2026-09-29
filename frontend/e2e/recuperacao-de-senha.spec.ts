/**
 * Recuperação de senha ponta a ponta, em navegador, contra o stack real.
 *
 * Este arquivo existe por causa de um defeito que passou por toda a DEM-001:
 * `POST /auth/reset-password` existia, `resetPassword` estava na fronteira de
 * dados, o e-mail era enviado com o link certo — e **não havia rota
 * `/redefinir-senha` na SPA**. Quem clicava no link caía em "Pagina nao
 * encontrada". Cada peça tinha teste; a costura não tinha nenhum.
 *
 * A asserção que importa é a última: a senha nova entra e a antiga deixa de
 * valer. Sem ela o teste provaria só que uma tela aparece.
 *
 *   docker compose -f docker-compose.test.yml -p gede2e up -d --build
 *   npx playwright test
 */

import { expect, test } from "@playwright/test";

const MAILPIT = process.env["E2E_MAILPIT_URL"] ?? "http://localhost:8027";
const API = `${process.env["E2E_BASE_URL"] ?? "http://localhost:8080"}/api`;

const marca = String(Date.now()).slice(-6);
const ADMIN = { usuario: "admin", senha: "senha-de-teste-admin-e2e" };
const PESSOA = {
  usuario: `esqueci${marca}`,
  email: `esqueci${marca}@exemplo.com`,
  senhaAntiga: "senha-antiga-e2e-123",
  senhaNova: "senha-nova-e2e-456",
};

async function tokenDe(usuario: string, senha: string): Promise<string> {
  const resposta = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: usuario, password: senha }),
  });
  return ((await resposta.json()) as { access_token: string }).access_token;
}

async function statusDoLogin(usuario: string, senha: string): Promise<number> {
  const resposta = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: usuario, password: senha }),
  });
  return resposta.status;
}

interface MensagemMailpit {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

async function esperarLinkDeRedefinicao(email: string): Promise<string> {
  for (let tentativa = 0; tentativa < 30; tentativa += 1) {
    const resposta = await fetch(`${MAILPIT}/api/v1/messages`);
    const corpo = (await resposta.json()) as { messages: MensagemMailpit[] };
    const encontrada = corpo.messages.find((m) =>
      m.To.some((d) => d.Address === email),
    );
    if (encontrada) {
      const detalhe = await fetch(`${MAILPIT}/api/v1/message/${encontrada.ID}`);
      const texto = ((await detalhe.json()) as { Text: string }).Text;
      const link = /https?:\/\/\S+redefinir-senha\S*/.exec(texto)?.[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`nenhum link de redefinição chegou para ${email}`);
}

test.describe.configure({ mode: "serial" });

test.describe("recuperação de senha", () => {
  let link = "";

  test("preparação: existe alguém que esqueceu a senha", async () => {
    const token = await tokenDe(ADMIN.usuario, ADMIN.senha);
    const criado = await fetch(`${API}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        username: PESSOA.usuario,
        email: PESSOA.email,
        password: PESSOA.senhaAntiga,
        role: "engenheiro",
      }),
    });
    expect(criado.status).toBe(201);
  });

  test("pede a redefinição e o e-mail traz um link que ABRE uma tela", async ({
    page,
  }) => {
    await page.goto("/esqueci-minha-senha");
    await page.getByLabel("E-mail").fill(PESSOA.email);
    await page.getByRole("button", { name: /Enviar instrucoes/i }).click();

    // A resposta é a mesma para e-mail existente ou não: não se revela cadastro.
    await expect(page.getByRole("status")).toContainText(/Se houver conta/i);

    link = await esperarLinkDeRedefinicao(PESSOA.email);
    expect(link).toContain("/redefinir-senha?token=");

    await page.goto(link);

    // O defeito era exatamente aqui: o link caía em "Pagina nao encontrada".
    await expect(
      page.getByRole("heading", { name: "Pagina nao encontrada" }),
    ).toBeHidden();
    await expect(page.getByRole("heading", { name: "Redefinir senha" })).toBeVisible();
  });

  test("redefine a senha e a antiga deixa de valer", async ({ page }) => {
    await page.goto(link);

    await page.getByLabel("Nova senha", { exact: true }).fill(PESSOA.senhaNova);
    await page.getByLabel("Confirme a nova senha").fill(PESSOA.senhaNova);
    await page.getByRole("button", { name: "Redefinir senha" }).click();

    await expect(page.getByRole("status")).toContainText(/redefinida/i);

    // A prova real: o efeito no servidor, não a mensagem na tela.
    expect(await statusDoLogin(PESSOA.usuario, PESSOA.senhaNova)).toBe(200);
    expect(await statusDoLogin(PESSOA.usuario, PESSOA.senhaAntiga)).toBe(401);
  });

  test("o token é de uso único: reusá-lo é recusado com explicação", async ({
    page,
  }) => {
    await page.goto(link);

    await page.getByLabel("Nova senha", { exact: true }).fill("terceira-senha-789");
    await page.getByLabel("Confirme a nova senha").fill("terceira-senha-789");
    await page.getByRole("button", { name: "Redefinir senha" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Pedir um novo link/i }),
    ).toBeVisible();
    // E a senha definida no teste anterior continua sendo a válida.
    expect(await statusDoLogin(PESSOA.usuario, PESSOA.senhaNova)).toBe(200);
  });

  test("link sem token explica o problema em vez de dar página não encontrada", async ({
    page,
  }) => {
    await page.goto("/redefinir-senha");

    await expect(page.getByRole("alert")).toContainText(/incompleto|inválido/i);
    await expect(page.getByRole("link", { name: /Pedir um novo link/i })).toBeVisible();
  });
});
