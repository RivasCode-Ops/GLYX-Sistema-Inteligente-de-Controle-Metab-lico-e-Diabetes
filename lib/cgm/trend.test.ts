import { describe, expect, it } from "vitest";
import { isPredictedHypo, predictTrend } from "./trend";

function series(values: number[], stepMin = 5): { valueMgDl: number; recordedAt: string }[] {
  const base = new Date("2026-07-13T12:00:00Z").getTime();
  return values.map((v, i) => ({
    valueMgDl: v,
    recordedAt: new Date(base + i * stepMin * 60_000).toISOString(),
  }));
}

describe("predictTrend", () => {
  it("detecta queda de ~2 mg/dL por minuto", () => {
    const t = predictTrend(series([130, 120, 110, 100]));
    expect(t).not.toBeNull();
    expect(t!.slopePerMin).toBeCloseTo(-2, 1);
    expect(t!.projectedMgDl).toBe(100 + -2 * 30);
  });

  it("estável não projeta queda", () => {
    const t = predictTrend(series([120, 121, 119, 120]));
    expect(Math.abs(t!.slopePerMin)).toBeLessThan(0.2);
  });

  it("exige pelo menos 3 pontos na janela de 25 min", () => {
    expect(predictTrend(series([120, 100]))).toBeNull();
    // pontos antigos fora da janela não contam
    expect(predictTrend(series([120, 110, 100], 20))).toBeNull();
  });
});

describe("isPredictedHypo", () => {
  it("alerta quando ainda acima de 70 mas caindo rumo à hipo", () => {
    const t = predictTrend(series([110, 100, 92, 85]));
    expect(isPredictedHypo(t)).toBe(true);
  });

  it("não alerta se já está abaixo de 70 (alerta imediato cuida disso)", () => {
    const t = predictTrend(series([80, 74, 69, 65]));
    expect(isPredictedHypo(t)).toBe(false);
  });

  it("não alerta subindo", () => {
    const t = predictTrend(series([120, 130, 140, 150]));
    expect(isPredictedHypo(t)).toBe(false);
  });

  it("usa o limiar do perfil, não 70 fixo", () => {
    // Queda que projeta ~77 mg/dL: não cruza 70, mas cruza a meta mínima 110
    // de quem combinou uma faixa mais alta com o médico. Antes o preditivo
    // ignorava isso e só o alerta reativo (já abaixo) disparava.
    const t = predictTrend(series([140, 133, 126, 119]));
    expect(isPredictedHypo(t)).toBe(false);
    expect(isPredictedHypo(t, 110)).toBe(true);
  });

  it("não alerta quando a leitura já está abaixo do limiar do perfil", () => {
    const t = predictTrend(series([108, 100, 92, 85]));
    expect(isPredictedHypo(t, 110)).toBe(false);
  });
});
