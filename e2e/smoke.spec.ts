import { test, expect } from "@playwright/test";

test.describe("GLYX smoke", () => {
  test("página de login renderiza", async ({ request }) => {
    const res = await request.get("/login");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Entrar/i);
    expect(html).toMatch(/e-mail|email/i);
  });

  test("raiz redireciona para login ou dashboard", async ({ request }) => {
    const res = await request.fetch("/", { maxRedirects: 0 });
    // Com Supabase: redirect; sem Supabase / já autenticado: 200 ou redirect.
    if ([302, 307, 308].includes(res.status())) {
      const location = res.headers()["location"] ?? "";
      expect(location).toMatch(/\/(login|dashboard)/);
      return;
    }
    expect(res.status()).toBe(200);
  });
});
