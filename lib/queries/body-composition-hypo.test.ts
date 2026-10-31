import { describe, expect, it, vi } from "vitest";
import { seedAliases, seedMechanisms } from "@/lib/safety/__fixtures__/read-seed";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => null }));

const { HYPO_RISK_MECHANISMS, usesGlucoseLoweringMedsCanonical } = await import("./body-composition");

// Etapa 2, B14: risco de hipoglicemia pela base canônica de mecanismos, com o
// seed REAL das migrations (aliases e mecanismos).

const aliases = seedAliases();
const hypo = new Set(
  seedMechanisms()
    .filter((m) => (HYPO_RISK_MECHANISMS as readonly string[]).includes(m.mechanism))
    .map((m) => m.canonical)
);
const risco = (nomes: string[]) => usesGlucoseLoweringMedsCanonical(nomes, aliases, hypo);

describe("risco de hipoglicemia pela base canônica", () => {
  it("nome comercial de secretagogo que o substring não pegava", () => {
    expect(risco(["Diamicron MR 60mg"])).toBe(true);
  });

  it("insulina pelo nome da molécula", () => {
    expect(risco(["Glargina 100 UI"])).toBe(true);
  });

  it("metformina sozinha não é risco de hipo", () => {
    expect(risco(["Metformina 850"])).toBe(false);
  });

  it("nome desconhecido da base cai na lista conservadora", () => {
    expect(risco(["Repaglinida genérica"])).toBe(true);
    expect(risco(["Vitamina D"])).toBe(false);
  });

  it("a base tem os três mecanismos de risco", () => {
    expect(hypo.size).toBeGreaterThanOrEqual(3);
  });
});
