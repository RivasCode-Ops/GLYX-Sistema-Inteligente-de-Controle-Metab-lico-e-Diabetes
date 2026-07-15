import type { Page } from "@playwright/test";

export function hasE2ECredentials(): boolean {
  return Boolean(process.env.E2E_USER_EMAIL?.trim() && process.env.E2E_USER_PASSWORD?.trim());
}

/** Login real — só quando E2E_USER_EMAIL / E2E_USER_PASSWORD estão definidas. */
export async function loginWithE2EUser(page: Page): Promise<void> {
  const email = process.env.E2E_USER_EMAIL!.trim();
  const password = process.env.E2E_USER_PASSWORD!.trim();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/(dashboard|bem-vindo)/, { timeout: 30_000 });
}
