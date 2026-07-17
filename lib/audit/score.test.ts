import { describe, expect, it } from "vitest";
import { computeAuditMetrics, type AuditRawInputs } from "@/lib/audit/metrics";
import { scoreFromMetrics } from "@/lib/audit/score";

function baseInput(over: Partial<AuditRawInputs> = {}): AuditRawInputs {
  return {
    windowDays: 14,
    targetMin: 70,
    targetMax: 180,
    glucose: [],
    meals: [],
    exercises: [],
    sleepDays: [],
    waterDays: [],
    medLogs: [],
    insulin: [],
    weights: [],
    examAlteredCount: 0,
    ...over,
  };
}

describe("computeAuditMetrics", () => {
  it("calcula TIR, hipos e hipers", () => {
    const metrics = computeAuditMetrics(
      baseInput({
        glucose: [
          { value_mg_dl: 90, recorded_at: "2026-07-01T10:00:00Z", day: "2026-07-01" },
          { value_mg_dl: 65, recorded_at: "2026-07-01T14:00:00Z", day: "2026-07-01" },
          { value_mg_dl: 200, recorded_at: "2026-07-02T10:00:00Z", day: "2026-07-02" },
          { value_mg_dl: 120, recorded_at: "2026-07-03T10:00:00Z", day: "2026-07-03" },
        ],
      })
    );
    expect(metrics.readingCount).toBe(4);
    expect(metrics.daysWithGlucose).toBe(3);
    expect(metrics.hypoCount).toBe(1);
    expect(metrics.hyperCount).toBe(1);
    expect(metrics.tirPercent).toBe(50);
  });
});

describe("scoreFromMetrics", () => {
  it("marca dados insuficientes com poucas leituras", () => {
    const metrics = computeAuditMetrics(
      baseInput({
        glucose: [
          { value_mg_dl: 100, recorded_at: "2026-07-01T10:00:00Z", day: "2026-07-01" },
          { value_mg_dl: 110, recorded_at: "2026-07-02T10:00:00Z", day: "2026-07-02" },
        ],
      })
    );
    const report = scoreFromMetrics(metrics, "2026-06-17", "2026-07-01");
    expect(report.label).toBe("Dados insuficientes");
    expect(report.score).toBe(0);
    expect(report.plan.length).toBeGreaterThan(0);
  });

  it("penaliza TIR baixo e gera plano", () => {
    const glucose = Array.from({ length: 10 }, (_, i) => ({
      value_mg_dl: i < 7 ? 220 : 120,
      recorded_at: `2026-07-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
      day: `2026-07-${String(i + 1).padStart(2, "0")}`,
    }));
    const metrics = computeAuditMetrics(baseInput({ glucose }));
    const report = scoreFromMetrics(metrics, "2026-06-17", "2026-07-10");
    expect(report.label).not.toBe("Dados insuficientes");
    expect(report.score).toBeLessThan(100);
    expect(report.factors.some((f) => f.id.startsWith("tir"))).toBe(true);
    expect(report.plan.some((p) => p.href.includes("glicemia"))).toBe(true);
  });

  it("score alto com leituras estáveis na faixa", () => {
    const glucose = Array.from({ length: 12 }, (_, i) => ({
      value_mg_dl: 110 + (i % 3) * 5,
      recorded_at: `2026-07-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
      day: `2026-07-${String((i % 8) + 1).padStart(2, "0")}`,
    }));
    const metrics = computeAuditMetrics(
      baseInput({
        glucose,
        waterDays: [
          { day: "2026-07-01", ml: 1500 },
          { day: "2026-07-02", ml: 1200 },
          { day: "2026-07-03", ml: 1800 },
          { day: "2026-07-04", ml: 1000 },
        ],
        exercises: [
          { duration_min: 30, started_at: "2026-07-01T18:00:00Z", day: "2026-07-01" },
          { duration_min: 25, started_at: "2026-07-03T18:00:00Z", day: "2026-07-03" },
        ],
      })
    );
    const report = scoreFromMetrics(metrics, "2026-06-17", "2026-07-12");
    expect(report.score).toBeGreaterThanOrEqual(70);
    expect(report.label).toBe("Estável");
  });
});
