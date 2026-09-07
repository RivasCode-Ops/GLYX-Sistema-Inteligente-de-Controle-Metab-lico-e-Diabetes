import { describe, expect, it } from "vitest";
import { seedAliases, seedMechanisms } from "./__fixtures__/read-seed";
import { resolveCanonical } from "./interaction-check";
import { buildMechanismReport, type UserSubstance } from "./mechanism-count";

const ALIASES = seedAliases();
const MECHANISMS = seedMechanisms();

/** Monta a substância como a rota monta: nome livre resolvido contra a base da fatia 1. */
function emUso(
  name: string,
  extra: Partial<Pick<UserSubstance, "kind" | "addedAt">> = {}
): UserSubstance {
  return {
    name,
    canonical: [...resolveCanonical([name], ALIASES).canonical],
    kind: extra.kind ?? "med",
    addedAt: extra.addedAt ?? null,
  };
}

describe("contagem de mecanismos", () => {
  it("Lantus + Fiasp + Glyxambi + berberina dá 5 vias distintas", () => {
    const r = buildMechanismReport(
      [
        emUso("Lantus SoloStar 100 UI/mL"),
        emUso("Fiasp FlexTouch"),
        emUso("Glyxambi 25/5"),
        emUso("Berberina 500mg", { kind: "supplement" }),
      ],
      MECHANISMS
    );
    expect(r.loweringCount).toBe(5);
    expect(r.lowering.map((m) => m.mechanism).sort()).toEqual([
      "glicosuria_renal",
      "incretina",
      "insulina_exogena_basal",
      "insulina_exogena_rapida",
      "sensibilizador_amp",
    ]);
  });

  /**
   * O que impede o contador de virar contagem de vidros no armário: sete
   * suplementos compartilham `sensibilizador_amp`, e três deles juntos são UMA
   * via, não três.
   */
  it("berberina + gymnema + cromo contribuem UM mecanismo", () => {
    const r = buildMechanismReport(
      [
        emUso("Berberina", { kind: "supplement" }),
        emUso("Gymnema Sylvestre", { kind: "supplement" }),
        emUso("Picolinato de cromo", { kind: "supplement" }),
      ],
      MECHANISMS
    );
    expect(r.loweringCount).toBe(1);
    expect(r.lowering[0].mechanism).toBe("sensibilizador_amp");
    expect(r.lowering[0].contributorNames).toHaveLength(3);
  });

  it("só Lantus dá 1", () => {
    const r = buildMechanismReport([emUso("Lantus")], MECHANISMS);
    expect(r.loweringCount).toBe(1);
  });

  it("separa mecanismo que não reduz glicemia", () => {
    const r = buildMechanismReport([emUso("Berberina", { kind: "supplement" })], MECHANISMS);
    expect(r.loweringCount).toBe(1);
    expect(r.other.map((m) => m.mechanism)).toEqual(["inibicao_cyp3a4_pgp"]);
  });

  it("substância fora da base não contribui e não quebra", () => {
    const r = buildMechanismReport([emUso("Whey isolado morango")], MECHANISMS);
    expect(r.loweringCount).toBe(0);
    expect(r.newest).toBeNull();
  });
});

describe("item mais recente", () => {
  const substancias = [
    emUso("Lantus", { addedAt: "2026-01-10T10:00:00Z" }),
    emUso("Berberina 500mg", { kind: "supplement", addedAt: "2026-09-02T09:00:00Z" }),
  ];

  it("é data, não juízo de causa", () => {
    const r = buildMechanismReport(substancias, MECHANISMS);
    expect(r.newest?.name).toBe("Berberina 500mg");
    expect(r.newest?.canonical).toBe("berberina");
    expect(r.newestIsSupplement).toBe(true);
  });

  it("ignora item que não reduz glicemia na disputa", () => {
    const r = buildMechanismReport(
      [
        ...substancias,
        emUso("Marevan 5mg", { addedAt: "2026-09-05T09:00:00Z" }),
      ],
      MECHANISMS
    );
    // Anticoagulante é o mais novo, mas não baixa glicemia — não disputa.
    expect(r.newest?.name).toBe("Berberina 500mg");
  });

  it("sem data de cadastro não há mais recente", () => {
    const r = buildMechanismReport([emUso("Lantus")], MECHANISMS);
    expect(r.newest).toBeNull();
    expect(r.newestIsSupplement).toBe(false);
  });
});

describe("seed de mecanismos", () => {
  it("foi lido", () => {
    expect(MECHANISMS.length).toBeGreaterThan(15);
  });

  it("todo slug citado tem alias na base da fatia 1", () => {
    const comAlias = new Set(ALIASES.map((a) => a.canonical));
    for (const m of MECHANISMS) {
      expect(comAlias.has(m.canonical), `${m.canonical} sem alias`).toBe(true);
    }
  });

  it("toda duração é positiva", () => {
    for (const m of MECHANISMS) {
      expect(m.typicalDurationHours, m.canonical).toBeGreaterThan(0);
    }
  });
});
