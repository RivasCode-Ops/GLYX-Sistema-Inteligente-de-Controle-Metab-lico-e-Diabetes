import { test, expect } from "@playwright/test";

test.describe("portões de autenticação (negativo)", () => {
  // O servidor de teste roda em modo dev: a primeira requisição a cada rota
  // paga a compilação sob demanda, e rotas pesadas (cgm/sync-dispatch carrega
  // supabase-js + módulos de sync) passam dos 30s padrão. O timeout maior
  // evita que "demorou pra compilar" seja lido como "o portão não fechou".
  test.describe.configure({ timeout: 120_000 });

  test("rotas clínicas redirecionam para login sem sessão", async ({ request }) => {
    for (const path of [
      "/dashboard",
      "/glicemia",
      "/medicacao",
      "/alimentacao",
      "/perfil",
      // Composição corporal: medidas, metas e sobretudo as FOTOS de corpo — o
      // dado mais sensível do app. Rota nova sem portão testado é exatamente
      // como um vazamento entra sem ninguém perceber.
      "/composicao",
      "/composicao/medidas",
      "/composicao/fotos",
      "/composicao/metas",
      "/composicao/historico",
    ]) {
      const res = await request.fetch(path, { maxRedirects: 0 });
      expect([302, 307, 308], path).toContain(res.status());
      const location = res.headers()["location"] ?? "";
      expect(location, path).toMatch(/\/login/);
    }
  });

  test("rotas de IA de composição corporal exigem sessão", async ({ request }) => {
    // A de foto manda imagem de corpo para o provedor de IA: 401 sem sessão
    // não é detalhe, é a barreira que impede qualquer um de disparar o envio.
    const res = await request.post("/api/ai/body-composition", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect([401, 503]).toContain(res.status());

    const photo = await request.post("/api/ai/body-photo-compare", {
      data: { fromId: "00000000-0000-0000-0000-000000000001", toId: "00000000-0000-0000-0000-000000000002" },
      headers: { "Content-Type": "application/json" },
    });
    expect([401, 503]).toContain(photo.status());
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
