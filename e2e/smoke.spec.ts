import { test, expect } from "@playwright/test";

test.describe("GLYX smoke", () => {
  test("página de login renderiza", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /entrar/i })).toBeVisible();
  });

  test("raiz redireciona para login ou dashboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/(login|dashboard)/, { timeout: 15_000 });
    const path = new URL(page.url()).pathname;
    expect(["/login", "/dashboard"]).toContain(path);
  });
});
