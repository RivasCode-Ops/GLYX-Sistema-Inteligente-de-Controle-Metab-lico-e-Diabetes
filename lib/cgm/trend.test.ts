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
});
