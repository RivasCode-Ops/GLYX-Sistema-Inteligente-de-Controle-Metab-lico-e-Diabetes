import { describe, expect, it } from "vitest";
import {
  adaptiveAdjustment,
  bmr,
  dailyTargets,
  safeWeeklyRateKg,
  smoothedWeight,
  tdee,
} from "./energy";

const homem = { sex: "m" as const, age: 40, heightCm: 175, weightKg: 90, activity: "light" as const };
const mulher = { sex: "f" as const, age: 55, heightCm: 160, weightKg: 70, activity: "sedentary" as const };

describe("bmr (Mifflin-St Jeor)", () => {
  it("calcula BMR de homem: 10*90 + 6.25*175 - 5*40 + 5 = 1799", () => {
    expect(bmr(homem)).toBe(1799);
  });
  it("calcula BMR de mulher: 10*70 + 6.25*160 - 5*55 - 161 = 1264", () => {
    expect(bmr(mulher)).toBe(1264);
  });
});

describe("tdee", () => {
  it("aplica fator de atividade leve (1.375)", () => {
    expect(tdee(homem)).toBe(Math.round(1799 * 1.375));
  });
});

describe("dailyTargets", () => {
  it("emagrecer: déficit de 500 kcal e 1.6 g/kg de proteína", () => {
    const t = dailyTargets(homem, "lose");
    expect(t.calories).toBe(tdee(homem) - 500);
    expect(t.protein_g).toBe(144);
  });
  it("nunca sugere menos de 1200 kcal", () => {
    const pequena = { sex: "f" as const, age: 70, heightCm: 150, weightKg: 45, activity: "sedentary" as const };
    expect(dailyTargets(pequena, "lose").calories).toBe(1200);
  });
  it("ganhar massa: superávit de 300 kcal e 1.8 g/kg", () => {
    const t = dailyTargets(homem, "gain");
    expect(t.calories).toBe(tdee(homem) + 300);
    expect(t.protein_g).toBe(162);
  });
});

describe("safeWeeklyRateKg", () => {
  it("perda segura ~0.75% do peso por semana", () => {
    expect(safeWeeklyRateKg(90, "lose")).toBe(0.68);
  });
  it("manter = 0", () => {
    expect(safeWeeklyRateKg(90, "maintain")).toBe(0);
  });
});

describe("smoothedWeight", () => {
  it("pondera registros recentes mais fortemente", () => {
    const v = smoothedWeight([
      { weightKg: 92, loggedOn: "2026-07-01" },
      { weightKg: 90, loggedOn: "2026-07-08" },
    ]);
    expect(v).toBeGreaterThan(90);
    expect(v).toBeLessThan(92);
    expect(v! - 90).toBeLessThan(92 - v!);
  });
  it("vazio retorna null", () => {
    expect(smoothedWeight([])).toBeNull();
  });
});

describe("adaptiveAdjustment", () => {
  const logs = [
    { weightKg: 90, loggedOn: "2026-06-01" },
    { weightKg: 89.5, loggedOn: "2026-06-08" },
    { weightKg: 89.4, loggedOn: "2026-06-15" },
    { weightKg: 89.2, loggedOn: "2026-06-22" },
  ];
  it("exige pelo menos 4 pesagens e 14 dias", () => {
    expect(adaptiveAdjustment(logs.slice(0, 3), "lose", 89)).toBeNull();
  });
  it("perda mais lenta que o plano sugere cortar calorias (com teto de 150)", () => {
    const adj = adaptiveAdjustment(logs, "lose", 89.2);
    expect(adj).not.toBeNull();
    expect(adj!.observedWeeklyKg).toBeCloseTo(-0.27, 1);
    expect(adj!.deltaKcal).toBeLessThan(0);
    expect(adj!.deltaKcal).toBeGreaterThanOrEqual(-150);
  });
  it("nunca ultrapassa o guardrail de ±150 kcal", () => {
    const parado = [
      { weightKg: 90, loggedOn: "2026-06-01" },
      { weightKg: 90.1, loggedOn: "2026-06-08" },
      { weightKg: 90, loggedOn: "2026-06-15" },
      { weightKg: 90.2, loggedOn: "2026-06-29" },
    ];
    const adj = adaptiveAdjustment(parado, "lose", 90);
    expect(Math.abs(adj!.deltaKcal)).toBeLessThanOrEqual(150);
  });
});
