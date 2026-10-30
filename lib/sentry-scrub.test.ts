import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubUrl } from "./sentry-scrub";

// GLYX-35: o que vai ao Sentry não leva o conteúdo da pessoa.

function eventoComTudo(): ErrorEvent {
  return {
    type: undefined,
    message: "falha ao gravar dose",
    request: {
      method: "POST",
      url: "https://glyx.app/api/cgm/ingest?user=u1&token=abc#topo",
      query_string: "user=u1&token=abc",
      data: JSON.stringify({ readings: [{ valueMgDl: 54, recordedAt: "2026-10-30T03:00:00Z" }] }),
      cookies: { "sb-access-token": "eyJ..." },
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer eyJ...",
        Cookie: "sb=1",
        "User-Agent": "Mozilla/5.0",
      },
    },
    user: { id: "u1", email: "pessoa@exemplo.com", ip_address: "1.2.3.4" },
    breadcrumbs: [
      { category: "console", message: "[meals] check violation carbs_g=9000", data: { arguments: ["x"] } },
      { category: "fetch", data: { url: "/api/ai/meal-text?q=pao", method: "POST", body: "{...}" } },
      { category: "navigation", data: { from: "/glicemia?d=1", to: "/medicacao" } },
    ],
  };
}

describe("scrubEvent", () => {
  it("o erro forçado sai sem corpo, cookie, query e cabeçalho sensível", () => {
    const e = scrubEvent(eventoComTudo());
    expect(e.request?.data).toBeUndefined();
    expect(e.request?.cookies).toBeUndefined();
    expect(e.request?.query_string).toBeUndefined();
    expect(e.request?.url).toBe("https://glyx.app/api/cgm/ingest?user=&token=");
    expect(e.request?.headers).toEqual({
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    });
    expect(e.request?.method).toBe("POST");
  });

  it("usuário fica só com o id", () => {
    expect(scrubEvent(eventoComTudo()).user).toEqual({ id: "u1" });
  });

  it("nenhum valor clínico sobra em lugar nenhum do evento", () => {
    const texto = JSON.stringify(scrubEvent(eventoComTudo()));
    for (const vazado of ["54", "9000", "pao", "eyJ", "pessoa@", "1.2.3.4", "abc"]) {
      expect(texto, vazado).not.toContain(vazado);
    }
  });

  it("evento sem request não quebra", () => {
    expect(scrubEvent({ type: undefined, message: "x" } as ErrorEvent).message).toBe("x");
  });
});

describe("scrubBreadcrumb e scrubUrl", () => {
  it("console perde a mensagem, fetch perde a query e o corpo", () => {
    expect(scrubBreadcrumb({ category: "console", message: "dose 12U" })?.message).toBe(
      "[console omitido]"
    );
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "/x?a=1", body: "b" } })?.data).toEqual({
      url: "/x?a=",
    });
  });

  it("URL sem query fica igual", () => {
    expect(scrubUrl("https://glyx.app/medicacao")).toBe("https://glyx.app/medicacao");
  });
});
