import { describe, expect, it } from "vitest";
import { bmr, dailyTargets, safeWeeklyRateKg, tdee } from "./energy";

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
