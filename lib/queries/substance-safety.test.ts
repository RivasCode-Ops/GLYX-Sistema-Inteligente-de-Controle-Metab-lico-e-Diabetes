import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { checkUnavailablePayload } from "@/lib/safety/present";
import {
  SafetyCheckUnavailableError,
  checkSubstanceSafety,
  loadInteracoesEmUso,
} from "./substance-safety";

// GLYX-27 / P13: leitura que falha não pode virar veredito "sem alerta".

type Resposta = { data: Record<string, unknown>[] | null; error: { message: string } | null };

/** Cliente mínimo: cada tabela devolve a resposta configurada, qualquer filtro. */
function cliente(respostas: Record<string, Resposta>): SupabaseClient {
  const from = (tabela: string) => {
    const r = respostas[tabela] ?? { data: [], error: null };
    const b = {
      select: () => b,
      eq: () => b,
      gte: () => b,
      then: <R>(resolve: (v: Resposta) => R) => Promise.resolve(resolve(r)),
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const BASE_OK: Record<string, Resposta> = {
  substance_aliases: {
    data: [
      { canonical: "berberina", alias: "berberina" },
      { canonical: "insulina_basal", alias: "lantus" },
    ],
    error: null,
  },
  substance_interactions: {
    data: [
      {
        substance_a: "berberina",
        substance_b: "insulina_basal",
        severity: "grave",
        mechanism: "soma de efeito hipoglicemiante",
        message: "Berberina com insulina pode somar efeito.",
      },
    ],
    error: null,
  },
  medications: { data: [{ name: "Lantus" }], error: null },
  insulin_logs: { data: [], error: null },
};

const falha = { data: null, error: { message: "permission denied" } };

describe("checkSubstanceSafety", () => {
  it("com a base legível, o caso do incidente bloqueia", async () => {
    const v = await checkSubstanceSafety(cliente(BASE_OK), "u1", ["Berberina"]);
    expect(v.blocked).toBe(true);
  });

  it.each([
    ["substance_aliases", falha],
    ["substance_interactions", falha],
    ["medications", falha],
    ["insulin_logs", falha],
    ["substance_aliases", { data: [], error: null }],
    ["substance_interactions", { data: [], error: null }],
  ])("leitura de %s falhando lança em vez de responder sem alerta", async (tabela, resposta) => {
    const c = cliente({ ...BASE_OK, [tabela]: resposta });
    await expect(checkSubstanceSafety(c, "u1", ["Berberina"])).rejects.toBeInstanceOf(
      SafetyCheckUnavailableError
    );
  });

  it("o panorama da tela de Interações também lança", async () => {
    const c = cliente({ ...BASE_OK, substance_interactions: falha });
    await expect(loadInteracoesEmUso(c, "u1")).rejects.toBeInstanceOf(SafetyCheckUnavailableError);
  });
});

describe("checkUnavailablePayload", () => {
  it("é âmbar e diz que a checagem não rodou — nunca o cinza de 'sem alerta'", () => {
    const p = checkUnavailablePayload();
    expect(p.tone).toBe("atencao");
    expect(p.noFindingNote).toBeNull();
    expect(p.label).toMatch(/não executada/);
    expect(p.unknownNote).toMatch(/não sabe/);
  });
});
