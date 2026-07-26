import { defineConfig, devices } from "@playwright/test";

/**
 * Porta do servidor de teste. Configurável porque `reuseExistingServer` reusa
 * **qualquer coisa** que já esteja escutando na porta — inclusive o servidor de
 * OUTRO projeto. Isso aconteceu de verdade em 26/07/2026: a 3000 estava ocupada
 * há dois dias por outro app da máquina, o Playwright reusou aquele servidor e
 * os 7 testes de portão falharam com 404, apontando para um bug que não existia.
 *
 * Com `E2E_PORT` dá para escapar da colisão sem derrubar o processo alheio:
 *   E2E_PORT=3100 npx playwright test
 */
const PORT = process.env.E2E_PORT || "3000";
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    // No CI a porta está sempre limpa e reusar mascararia um servidor zumbi.
    reuseExistingServer: !process.env.CI,
    // Cold start do Turbopack + compilação da primeira rota passa de 2 min em
    // máquina fria; 180s derrubava a suíte antes do primeiro teste rodar.
    timeout: 360_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // Garante fail-closed do convite nos testes de API mesmo sem .env.local
      SIGNUP_INVITE_CODE: process.env.SIGNUP_INVITE_CODE || "e2e-invite-gate",
    },
  },
});
