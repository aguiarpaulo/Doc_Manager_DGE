import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra o stack real de `docker-compose.test.yml`.
 *
 * Não há `webServer` aqui de propósito: o alvo é a SPA **construída e servida
 * pelo Caddy**, exatamente como em produção, não um servidor de desenvolvimento.
 * Testar o `vite dev` provaria menos.
 */
export default defineConfig({
  testDir: "./e2e",
  // Sequencial: a jornada compartilha um documento e uma caixa de e-mail.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/resultado.json" }],
  ],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
