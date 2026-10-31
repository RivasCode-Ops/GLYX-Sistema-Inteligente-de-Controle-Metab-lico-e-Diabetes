import { describe, expect, it } from "vitest";
import { computeAuditMetrics, type AuditRawInputs } from "@/lib/audit/metrics";
import { scoreFromMetrics } from "@/lib/audit/score";

// Correção de 31/10/2026: com score por episódio, leitura de glicosímetro
// (sem vizinha a ≤ 30 min) nunca formava episódio e a hipo sumia do score.

function entrada(glucose: { value_mg_dl: number; recorded_at: string }[]): AuditRawInputs {
  return {
    windowDays: 7,
    targetMin: 70,
    targetMax: 180,
    glucose: glucose.map((g) => ({ ...g, day: g.recorded_at.slice(0, 10) })),
    meals: [],
    exercises: [],
    sleepDays: [],
    waterDays: [],
    medLogs: [],
    insulin: [],
    weights: [],
    examAlteredCount: 0,
  };
}

const dedo = (dia: number, hora: number, v: number) => ({
  value_mg_dl: v,
  recorded_at: `2026-10-${String(20 + dia).padStart(2, "0")}T${String(hora).padStart(2, "0")}:00:00Z`,
});

describe("score: hipo de glicosímetro", () => {
  // 3 dias, leituras espaçadas de horas: 55, 48 e 60 isoladas, o resto na faixa.
  const leituras = [
    dedo(0, 10, 120), dedo(0, 14, 55), dedo(0, 19, 130),
    dedo(1, 10, 48), dedo(1, 14, 140), dedo(1, 19, 150),
    dedo(2, 10, 110), dedo(2, 14, 60), dedo(2, 19, 125),
  ];

  it("leituras isoladas abaixo da meta contam como eventos e o fator é crítico", () => {
    const m = computeAuditMetrics(entrada(leituras));
    expect(m.hypoEpisodes).toBe(0);
    expect(m.hypoIsoladas).toBe(3);
    const f = scoreFromMetrics(m, "2026-10-20", "2026-10-26").factors.find((x) => x.id === "hypos")!;
    expect(f.severity).toBe("critical");
    expect(f.scoreImpact).toBe(18);
    expect(f.evidence).toMatch(/3 leitura\(s\) isolada\(s\)/);
  });

  it("oscilação breve de sensor (vizinhas a 5 min, < 15 min fora) não vira evento", () => {
    const t0 = Date.parse("2026-10-20T10:00:00Z");
    const sensor = [130, 125, 66, 120, 128].map((v, i) => ({
      value_mg_dl: v,
      recorded_at: new Date(t0 + i * 5 * 60_000).toISOString(),
    }));
    const m = computeAuditMetrics(entrada([...sensor, ...leituras.filter((l) => l.value_mg_dl >= 70)]));
    expect(m.hypoIsoladas).toBe(0);
    expect(scoreFromMetrics(m, "2026-10-20", "2026-10-26").factors.find((x) => x.id === "hypos")).toBeUndefined();
  });
});