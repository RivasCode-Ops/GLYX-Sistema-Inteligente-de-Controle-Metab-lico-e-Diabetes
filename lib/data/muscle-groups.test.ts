import { describe, expect, it } from "vitest";
import { isMuscleGroupId, MUSCLE_GROUPS, resolveMuscleGroupIds } from "./muscle-groups";

describe("resolveMuscleGroupIds", () => {
  it("mantém um id atual como ele é", () => {
    expect(resolveMuscleGroupIds("quadriceps")).toEqual(["quadriceps"]);
    expect(resolveMuscleGroupIds("peito")).toEqual(["peito"]);
  });

  it('expande o "pernas" legado nos dois grupos de coxa', () => {
    // Sessões gravadas antes da separação: descartá-las faria quadríceps e
    // posterior aparecerem como nunca treinados.
    expect(resolveMuscleGroupIds("pernas")).toEqual(["quadriceps", "posterior"]);
  });

  it("ignora valor desconhecido em vez de quebrar", () => {
    expect(resolveMuscleGroupIds("biceps_femoral")).toEqual([]);
    expect(resolveMuscleGroupIds("")).toEqual([]);
  });
});

describe("MUSCLE_GROUPS", () => {
  it("não tem id duplicado", () => {
    const ids = MUSCLE_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('não expõe mais "pernas" como grupo selecionável', () => {
    expect(isMuscleGroupId("pernas")).toBe(false);
    expect(MUSCLE_GROUPS.map((g) => g.id)).toContain("quadriceps");
    expect(MUSCLE_GROUPS.map((g) => g.id)).toContain("posterior");
  });
});
