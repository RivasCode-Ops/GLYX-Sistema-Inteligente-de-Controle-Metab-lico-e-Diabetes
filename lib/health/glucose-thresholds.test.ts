import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET_MAX_MG_DL,
  DEFAULT_TARGET_MIN_MG_DL,
  isCoherentTargetRange,
  resolveGlucoseTargets,
  SEVERE_HYPER_MG_DL,
} from "./glucose-thresholds";

describe("isCoherentTargetRange", () => {
  it("aceita faixa clínica comum", () => {
    expect(isCoherentTargetRange(70, 180)).toBe(true);
    expect(isCoherentTargetRange(80, 160)).toBe(true);
  });

  it("recusa min maior que max — o caso que passava direto pro banco", () => {
    expect(isCoherentTargetRange(180, 70)).toBe(false);
  });

  it("recusa negativo, zero e absurdo", () => {
    expect(isCoherentTargetRange(-10, 180)).toBe(false);
    expect(isCoherentTargetRange(0, 180)).toBe(false);
    expect(isCoherentTargetRange(70, 5000)).toBe(false);
  });

  it("recusa faixa colada demais pra render TIR útil", () => {
    expect(isCoherentTargetRange(100, 110)).toBe(false);
    expect(isCoherentTargetRange(100, 120)).toBe(true);
  });

  it("recusa par incompleto", () => {
    expect(isCoherentTargetRange(70, null)).toBe(false);
    expect(isCoherentTargetRange(null, null)).toBe(false);
  });
});

describe("resolveGlucoseTargets", () => {
  it("usa o padrão quando o perfil não configurou nada", () => {
    expect(resolveGlucoseTargets(null)).toEqual({
      targetMin: DEFAULT_TARGET_MIN_MG_DL,
      targetMax: DEFAULT_TARGET_MAX_MG_DL,
      hypoThreshold: DEFAULT_TARGET_MIN_MG_DL,
      severeHyper: SEVERE_HYPER_MG_DL,
    });
  });

  it("respeita a faixa pessoal e deriva o limiar de hipo dela", () => {
    const t = resolveGlucoseTargets({ target_glucose_min: 80, target_glucose_max: 160 });
    expect(t.targetMin).toBe(80);
    expect(t.targetMax).toBe(160);
    // O preditivo do CGM usava 70 fixo aqui enquanto o alerta por leitura já
    // usava 80 — origem de dois limiares de hipo pro mesmo usuário.
    expect(t.hypoThreshold).toBe(80);
  });

  it("faixa incoerente cai INTEIRA pro padrão, sem inventar meia faixa", () => {
    const t = resolveGlucoseTargets({ target_glucose_min: 200, target_glucose_max: 120 });
    expect(t.targetMin).toBe(DEFAULT_TARGET_MIN_MG_DL);
    expect(t.targetMax).toBe(DEFAULT_TARGET_MAX_MG_DL);
  });

  it("hiper severa não depende da meta pessoal", () => {
    expect(resolveGlucoseTargets({ target_glucose_min: 90, target_glucose_max: 220 }).severeHyper).toBe(
      SEVERE_HYPER_MG_DL
    );
  });
});
