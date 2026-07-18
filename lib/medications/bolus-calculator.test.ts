import { describe, expect, it } from "vitest";
import { computeBolusDose } from "./bolus-calculator";

describe("computeBolusDose", () => {
  it("retorna null sem razão carbo/insulina configurada", () => {
    expect(
      computeBolusDose({ carbsG: 60, currentGlucose: 150, carbRatio: null, correctionFactor: 30, targetGlucose: 100 })
    ).toBeNull();
  });

  it("calcula só a dose de carboidrato quando não há correção configurada", () => {
    const r = computeBolusDose({
      carbsG: 60,
      currentGlucose: null,
      carbRatio: 15,
      correctionFactor: null,
      targetGlucose: null,
    });
    expect(r).toEqual({ carbDose: 4, correctionDose: 0, totalDose: 4 });
  });

  it("soma a dose de correção quando a glicemia atual está acima da meta", () => {
    const r = computeBolusDose({
      carbsG: 45,
      currentGlucose: 190,
      carbRatio: 15,
      correctionFactor: 30,
      targetGlucose: 100,
    });
    // carbDose = 3; correctionDose = (190-100)/30 = 3; total = 6
    expect(r).toEqual({ carbDose: 3, correctionDose: 3, totalDose: 6 });
  });

  it("não soma correção negativa quando a glicemia já está abaixo da meta", () => {
    const r = computeBolusDose({
      carbsG: 30,
      currentGlucose: 80,
      carbRatio: 10,
      correctionFactor: 30,
      targetGlucose: 100,
    });
    expect(r).toEqual({ carbDose: 3, correctionDose: 0, totalDose: 3 });
  });

  it("arredonda para 1 casa decimal", () => {
    const r = computeBolusDose({
      carbsG: 50,
      currentGlucose: null,
      carbRatio: 12,
      correctionFactor: null,
      targetGlucose: null,
    });
    expect(r?.carbDose).toBeCloseTo(4.2, 1);
  });
});
