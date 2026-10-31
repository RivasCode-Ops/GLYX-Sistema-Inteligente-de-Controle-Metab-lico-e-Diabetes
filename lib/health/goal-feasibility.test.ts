import { describe, expect, it } from "vitest";
import { assessGoalFeasibility } from "./goal-feasibility";

// Etapa 2, C10: o veredito é do código; o mesmo perfil dá sempre o mesmo.

const base = { weightKg: 100, heightCm: 175, goal: "lose" as const };

describe("assessGoalFeasibility", () => {
  it("meta que cabe em 6 meses no ritmo seguro é realista", () => {
    // 0,75 kg/semana; 10 kg ≈ 14 semanas.
    const r = assessGoalFeasibility({ ...base, targetWeightKg: 90 });
    expect(r.verdict).toBe("realista");
    expect(r.semanasAteMeta).toBe(14);
  });

  it("meta além de 6 meses no ritmo seguro é agressiva", () => {
    const r = assessGoalFeasibility({ ...base, targetWeightKg: 70 });
    expect(r.verdict).toBe("agressiva");
  });

  it("peso-meta com IMC abaixo de 18,5 é arriscada", () => {
    // 175 cm: IMC 18,5 ≈ 56,7 kg.
    expect(assessGoalFeasibility({ ...base, targetWeightKg: 55 }).verdict).toBe("arriscada");
  });

  it("meta na direção contrária ao objetivo é arriscada", () => {
    expect(assessGoalFeasibility({ ...base, targetWeightKg: 110 }).verdict).toBe("arriscada");
  });

  it("sem meta declarada é realista e os marcos seguem o ritmo seguro", () => {
    const r = assessGoalFeasibility({ ...base, targetWeightKg: null });
    expect(r.verdict).toBe("realista");
    expect(r.monthlyMilestones).toHaveLength(6);
    expect(r.monthlyMilestones[0].weight_kg).toBeCloseTo(96.7, 1);
  });

  it("os marcos param na meta, nunca a ultrapassam", () => {
    const r = assessGoalFeasibility({ ...base, targetWeightKg: 95 });
    expect(Math.min(...r.monthlyMilestones.map((m) => m.weight_kg))).toBe(95);
  });

  it("é determinístico", () => {
    const a = assessGoalFeasibility({ ...base, targetWeightKg: 80 });
    const b = assessGoalFeasibility({ ...base, targetWeightKg: 80 });
    expect(a).toEqual(b);
  });
});
