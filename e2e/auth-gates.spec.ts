import { test, expect } from "@playwright/test";

test.describe("portões de autenticação (negativo)", () => {
  test("rotas clínicas redirecionam para login sem sessão", async ({ request }) => {
    for (const path of ["/dashboard", "/glicemia", "/medicacao", "/alimentacao", "/perfil"]) {
      const res = await request.fetch(path, { maxRedirects: 0 });
      expect([302, 307, 308], path).toContain(res.status());
      const location = res.headers()["location"] ?? "";
      expect(location, path).toMatch(/\/login/);
    }
  });

  test("export LGPD exige sessão", async ({ request }) => {
    const res = await request.get("/api/me/export");
    expect(res.status()).toBe(401);
  });

  test("crons rejeitam sem segredo", async ({ request }) => {
    const routes = [
      "/api/push/dispatch",
      "/api/cgm/sync-dispatch",
      "/api/meals/suggest-dispatch",
    ];
    for (const route of routes) {
      const res = await request.post(route, {
        data: [],
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status(), route).toBe(401);
    }
  });

  test("crons rejeitam segredo errado", async ({ request }) => {
    const res = await request.post("/api/push/dispatch", {
      data: [],
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": "segredo-invalido-e2e",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("convite inválido é recusado", async ({ request }) => {
    const res = await request.post("/api/auth/verify-invite", {
      data: { code: "codigo-errado-e2e" },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  test("página de registro exige campo de convite", async ({ request }) => {
    const res = await request.get("/register");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Código de convite|inviteCode/i);
    expect(html).toMatch(/Registrar|Criar conta/i);
  });
});
