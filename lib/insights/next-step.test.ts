import { describe, expect, it } from "vitest";
import { getNextStepInsight } from "./next-step";

describe("getNextStepInsight", () => {
  it("pede leitura quando não há glicemia registrada", () => {
    const r = getNextStepInsight({ latestGlucose: null, carbsToday: 0, activeMinutes: 0 });
    expect(r.tone).toBe("neutral");
    expect(r.actionHref).toBe("/glicemia");
  });

  it("alerta hipoglicemia abaixo de 70", () => {
    const r = getNextStepInsight({ latestGlucose: 65, carbsToday: 10, activeMinutes: 0 });
    expect(r.tone).toBe("danger");
  });

  it("alerta hiperglicemia grave acima de 180", () => {
    const r = getNextStepInsight({ latestGlucose: 200, carbsToday: 50, activeMinutes: 20 });
    expect(r.tone).toBe("danger");
  });

  it("sugere caminhada quando moderado e sem atividade", () => {
    const r = getNextStepInsight({ latestGlucose: 150, carbsToday: 50, activeMinutes: 0 });
    expect(r.tone).toBe("warning");
    expect(r.actionHref).toBe("/exercicios/plano");
  });

  it("sugere controlar carboidrato quando moderado mas já houve atividade", () => {
    const r = getNextStepInsight({ latestGlucose: 150, carbsToday: 50, activeMinutes: 20 });
    expect(r.tone).toBe("warning");
    expect(r.actionHref).toBe("/alimentacao/foto");
  });

  it("pede primeiro registro quando dia zerado mas glicemia normal", () => {
    const r = getNextStepInsight({ latestGlucose: 100, carbsToday: 0, activeMinutes: 0 });
    expect(r.tone).toBe("neutral");
  });

  it("reforça positivo quando dentro da meta e dia já tem registro", () => {
    const r = getNextStepInsight({ latestGlucose: 100, carbsToday: 40, activeMinutes: 10 });
    expect(r.tone).toBe("success");
  });
});
