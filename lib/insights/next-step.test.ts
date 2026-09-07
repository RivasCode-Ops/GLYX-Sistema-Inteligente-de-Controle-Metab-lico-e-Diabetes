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

  /**
   * Regressão da sugestão de exercício, removida em 07/09/2026.
   *
   * A função não recebe `insulin_logs`, então não tem como saber se há insulina
   * rápida ativa. Entre 140 e 179 — que é exatamente onde a sugestão aparecia —
   * exercício com insulina em ação SOMA ao efeito hipoglicemiante. O teste
   * afirma a ausência, e não só a presença da alternativa: é a ausência que
   * precisa falhar barulhento se alguém reintroduzir o atalho.
   */
  it("não sugere exercício com glicemia moderada e nenhuma atividade", () => {
    const r = getNextStepInsight({ latestGlucose: 150, carbsToday: 50, activeMinutes: 0 });
    expect(r.actionHref).not.toBe("/exercicios/plano");
    expect(r.text).not.toMatch(/caminhada|exercício|atividade física/i);
  });

  it("orienta carboidrato quando moderado, com ou sem atividade no dia", () => {
    for (const activeMinutes of [0, 20]) {
      const r = getNextStepInsight({ latestGlucose: 150, carbsToday: 50, activeMinutes });
      expect(r.tone).toBe("warning");
      expect(r.actionHref).toBe("/alimentacao/foto");
    }
  });

  it("nenhum caminho da função aponta para o plano de exercício", () => {
    const cenarios = [null, 60, 100, 150, 179, 200];
    for (const latestGlucose of cenarios) {
      for (const activeMinutes of [0, 30]) {
        for (const carbsToday of [0, 50]) {
          const r = getNextStepInsight({ latestGlucose, carbsToday, activeMinutes });
          expect(r.actionHref, `glicemia ${latestGlucose}`).not.toBe("/exercicios/plano");
        }
      }
    }
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
