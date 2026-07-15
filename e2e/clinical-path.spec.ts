import { test, expect } from "@playwright/test";
import { hasE2ECredentials, loginWithE2EUser } from "./helpers/auth";

/**
 * Requer browser Playwright + conta real.
 * CI: configure secrets E2E_USER_EMAIL / E2E_USER_PASSWORD (e `npx playwright install`).
 * Local: mesmo par de env vars apontando ao seu Supabase.
 */
test.describe("caminho clínico autenticado", () => {
  test.skip(!hasE2ECredentials(), "Defina E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar.");

  test("login → dashboard → registrar glicemia", async ({ page }) => {
    await loginWithE2EUser(page);

    // Onboarding pode interceptar — se estiver em bem-vindo, ainda há shell de app.
    if (page.url().includes("/bem-vindo")) {
      await page.goto("/dashboard");
    }

    await expect(page.getByRole("button", { name: /registrar leitura/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /registrar leitura/i }).click();
    await expect(page.getByRole("heading", { name: /registrar glicemia/i })).toBeVisible();

    const value = String(100 + Math.floor(Math.random() * 40));
    await page.locator("#value_mg_dl").fill(value);
    await page.getByRole("button", { name: /^salvar$/i }).click();
    await expect(page.getByText(/leitura salva/i)).toBeVisible({ timeout: 15_000 });
  });

  test("módulo medicação abre após login", async ({ page }) => {
    await loginWithE2EUser(page);
    await page.goto("/medicacao");
    await expect(page.getByText(/adicionar medicamento/i)).toBeVisible({ timeout: 15_000 });
  });

  test("export LGPD autenticado devolve JSON", async ({ page, request }) => {
    await loginWithE2EUser(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await request.get("/api/me/export", {
      headers: { Cookie: cookieHeader },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { user?: { id?: string }; glucose_readings?: unknown };
    expect(body.user?.id).toBeTruthy();
    expect(Array.isArray(body.glucose_readings)).toBe(true);
  });
});
