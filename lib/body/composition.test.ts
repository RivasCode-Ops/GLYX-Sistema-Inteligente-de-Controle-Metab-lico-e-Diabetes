import { describe, expect, it } from "vitest";
import {
  bmi,
  bodyFatFromCircumferences,
  bodyFatFromSkinfolds,
  computeComposition,
  normalizedFfmi,
  sameMethod,
  waistToHeightBand,
} from "./composition";

describe("bmi", () => {
  it("calcula e arredonda", () => {
    expect(bmi(80, 180)).toBe(24.7);
  });
  it("recusa entrada inválida em vez de devolver Infinity", () => {
    expect(bmi(80, 0)).toBeNull();
    expect(bmi(0, 180)).toBeNull();
  });
});

describe("bodyFatFromCircumferences", () => {
  it("estima gordura masculina a partir de cintura e pescoço", () => {
    const bf = bodyFatFromCircumferences({ sex: "m", heightCm: 180, waistCm: 91, neckCm: 39 });
    expect(bf).not.toBeNull();
    expect(bf!).toBeGreaterThan(15);
    expect(bf!).toBeLessThan(25);
  });

  it("cintura menor que pescoço não produz número: a conta não existe", () => {
    expect(bodyFatFromCircumferences({ sex: "m", heightCm: 180, waistCm: 35, neckCm: 39 })).toBeNull();
  });

  it("equação feminina exige quadril — sem ele, null em vez de usar a masculina", () => {
    expect(
      bodyFatFromCircumferences({ sex: "f", heightCm: 165, waistCm: 75, neckCm: 32 })
    ).toBeNull();
    expect(
      bodyFatFromCircumferences({ sex: "f", heightCm: 165, waistCm: 75, neckCm: 32, hipCm: 98 })
    ).not.toBeNull();
  });

  it("descarta resultado fisiologicamente impossível", () => {
    // Cintura absurda para a altura levaria a >70% de gordura.
    expect(
      bodyFatFromCircumferences({ sex: "m", heightCm: 150, waistCm: 240, neckCm: 30 })
    ).toBeNull();
  });
});

describe("bodyFatFromSkinfolds", () => {
  it("usa o protocolo masculino (peitoral, abdominal, coxa)", () => {
    const bf = bodyFatFromSkinfolds({
      sex: "m",
      ageYears: 40,
      chestMm: 12,
      abdominalMm: 20,
      thighMm: 14,
    });
    expect(bf).not.toBeNull();
    expect(bf!).toBeGreaterThan(10);
    expect(bf!).toBeLessThan(25);
  });

  it("falta uma dobra do protocolo → null, não completa com outra", () => {
    expect(
      bodyFatFromSkinfolds({ sex: "m", ageYears: 40, chestMm: 12, abdominalMm: 20 })
    ).toBeNull();
    // Dobras femininas presentes não salvam o protocolo masculino.
    expect(
      bodyFatFromSkinfolds({
        sex: "m",
        ageYears: 40,
        tricepsMm: 12,
        suprailiacMm: 20,
        thighMm: 14,
      })
    ).toBeNull();
  });
});

describe("computeComposition", () => {
  const base = { sex: "m" as const, ageYears: 40, heightCm: 180 };

  it("prefere dobras quando o protocolo está completo", () => {
    const c = computeComposition({
      ...base,
      measurement: {
        measured_on: "2026-07-01",
        weight_kg: 80,
        waist_cm: 91,
        neck_cm: 39,
        skf_chest_mm: 12,
        skf_abdominal_mm: 20,
        skf_thigh_mm: 14,
      },
    });
    expect(c.bodyFatMethod).toBe("dobras");
    expect(c.leanMassKg).not.toBeNull();
    expect(c.fatMassKg! + c.leanMassKg!).toBeCloseTo(80, 0);
  });

  it("cai para circunferências sem as dobras", () => {
    const c = computeComposition({
      ...base,
      measurement: { measured_on: "2026-07-01", weight_kg: 80, waist_cm: 91, neck_cm: 39 },
    });
    expect(c.bodyFatMethod).toBe("circunferencias");
  });

  it("IMC e cintura/altura funcionam sem sexo no perfil", () => {
    const c = computeComposition({
      measurement: { measured_on: "2026-07-01", weight_kg: 80, waist_cm: 90 },
      sex: null,
      ageYears: null,
      heightCm: 180,
    });
    expect(c.bmi).toBe(24.7);
    expect(c.waistToHeight).toBe(0.5);
    expect(c.bodyFatPercent).toBeNull();
  });

  it("usa o peso de weight_logs quando a medição não trouxe peso", () => {
    const c = computeComposition({
      ...base,
      measurement: { measured_on: "2026-07-01", waist_cm: 91, neck_cm: 39 },
      fallbackWeightKg: 78,
    });
    expect(c.weightKg).toBe(78);
  });
});

describe("sameMethod", () => {
  it("bloqueia comparação entre métodos diferentes", () => {
    const a = { bodyFatMethod: "dobras" } as never;
    const b = { bodyFatMethod: "circunferencias" } as never;
    expect(sameMethod(a, b)).toBe(false);
  });
  it("permite dentro do mesmo método", () => {
    const a = { bodyFatMethod: "dobras" } as never;
    expect(sameMethod(a, a)).toBe(true);
  });
  it("sem método não compara", () => {
    const a = { bodyFatMethod: null } as never;
    expect(sameMethod(a, a)).toBe(false);
  });
});

describe("waistToHeightBand", () => {
  it("classifica pelas faixas de referência", () => {
    expect(waistToHeightBand(0.45)?.tone).toBe("ok");
    expect(waistToHeightBand(0.55)?.tone).toBe("atencao");
    expect(waistToHeightBand(0.62)?.tone).toBe("alto");
    expect(waistToHeightBand(null)).toBeNull();
  });
});

describe("normalizedFfmi", () => {
  it("normaliza para 1,80 m", () => {
    expect(normalizedFfmi(65, 180)).toBe(20.1);
  });
});
