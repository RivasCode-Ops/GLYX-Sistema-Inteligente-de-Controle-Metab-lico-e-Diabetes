import { describe, expect, it } from "vitest";
import { computeBolusDose } from "./bolus-calculator";

describe("computeBolusDose", () => {
  it("não calcula sem razão carbo/insulina configurada", () => {
    const r = computeBolusDose({
      carbsG: 60,
      currentGlucose: 150,
      carbRatio: null,
      correctionFactor: 30,
      targetGlucose: 100,
    });
    expect(r.status).toBe("unconfigured");
  });

  it("calcula só a dose de carboidrato quando não há correção configurada", () => {
    const r = computeBolusDose({
      carbsG: 60,
      currentGlucose: null,
      carbRatio: 15,
      correctionFactor: null,
      targetGlucose: null,
    });
    expect(r).toMatchObject({ status: "ok", carbDose: 4, correctionDose: 0, totalDose: 4 });
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
    expect(r).toMatchObject({ status: "ok", carbDose: 3, correctionDose: 3, totalDose: 6 });
  });

  it("arredonda para 1 casa decimal", () => {
    const r = computeBolusDose({
      carbsG: 50,
      currentGlucose: null,
      carbRatio: 12,
      correctionFactor: null,
      targetGlucose: null,
    });
    expect(r.status === "ok" && r.carbDose).toBeCloseTo(4.2, 1);
  });
});

describe("trava de hipoglicemia", () => {
  it("recusa o cálculo quando a glicemia está abaixo do limiar", () => {
    // O caso perigoso: antes da trava, isto devolvia a dose de carboidrato
    // cheia (6U) porque só a parcela de correção era zerada.
    const r = computeBolusDose({
      carbsG: 60,
      currentGlucose: 55,
      carbRatio: 10,
      correctionFactor: 30,
      targetGlucose: 100,
    });

    expect(r).toEqual({ status: "blocked", reason: "hipoglicemia", glucose: 55, threshold: 70 });
  });

  it("usa a meta mínima do perfil como limiar, não 70 fixo", () => {
    const input = {
      carbsG: 30,
      currentGlucose: 78,
      carbRatio: 10,
      correctionFactor: 30,
      targetGlucose: 110,
    };

    // Com meta mínima de 80, 78 mg/dL já é hipo para este usuário.
    expect(computeBolusDose({ ...input, targetGlucoseMin: 80 }).status).toBe("blocked");
    // Com o padrão de 70, a mesma leitura calcula normalmente.
    expect(computeBolusDose(input).status).toBe("ok");
  });

  it("não bloqueia exatamente no limiar", () => {
    const r = computeBolusDose({
      carbsG: 30,
      currentGlucose: 70,
      carbRatio: 10,
      correctionFactor: 30,
      targetGlucose: 100,
    });
    expect(r.status).toBe("ok");
  });

  it("calcula normalmente quando a glicemia não foi informada", () => {
    const r = computeBolusDose({
      carbsG: 30,
      currentGlucose: null,
      carbRatio: 10,
      correctionFactor: 30,
      targetGlucose: 100,
    });
    expect(r.status).toBe("ok");
  });
});

describe("avisos", () => {
  it("avisa que o cálculo ignora insulina ativa em toda dose", () => {
    const r = computeBolusDose({
      carbsG: 45,
      currentGlucose: 190,
      carbRatio: 15,
      correctionFactor: 30,
      targetGlucose: 100,
    });
    expect(r.status === "ok" && r.warnings).toContain("sem_iob");
  });

  it("sinaliza glicemia abaixo da meta, sem bloquear", () => {
    const r = computeBolusDose({
      carbsG: 30,
      currentGlucose: 85,
      carbRatio: 10,
      correctionFactor: 30,
      targetGlucose: 100,
    });

    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.warnings).toContain("abaixo_da_meta");
    // Sem correção negativa: a parcela de correção continua zerada.
    expect(r).toMatchObject({ correctionDose: 0, totalDose: 3 });
  });

  it("não sinaliza abaixo_da_meta quando a glicemia está acima", () => {
    const r = computeBolusDose({
      carbsG: 30,
      currentGlucose: 150,
      carbRatio: 10,
      correctionFactor: 30,
      targetGlucose: 100,
    });
    expect(r.status === "ok" && r.warnings).not.toContain("abaixo_da_meta");
  });
});
