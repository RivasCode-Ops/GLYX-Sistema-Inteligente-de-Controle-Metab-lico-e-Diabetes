import { describe, expect, it } from "vitest";
import { computeAuditMetrics, type AuditRawInputs } from "@/lib/audit/metrics";
import { buildWeeklySummary, weeklySummaryText } from "./weekly-summary";

function inputs(over: Partial<AuditRawInputs> = {}): AuditRawInputs {
  return {
    windowDays: 7,
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

/** Série de leituras espalhada por `days` dias, `perDay` por dia. */
function glucose(values: number[], days = 5) {
  return values.map((value, i) => {
    const day = `2026-07-${String(10 + (i % days)).padStart(2, "0")}`;
    return { value_mg_dl: value, recorded_at: `${day}T12:00:00Z`, day };
  });
}

function summaryOf(current: AuditRawInputs, previous: AuditRawInputs | null) {
  return buildWeeklySummary({
    metrics: computeAuditMetrics(current),
    previousMetrics: previous ? computeAuditMetrics(previous) : null,
    periodStart: "2026-07-10",
    periodEnd: "2026-07-16",
    targetMin: 70,
    targetMax: 180,
  });
}

describe("buildWeeklySummary", () => {
  it("marca falta de dado em vez de mostrar TIR de duas leituras", () => {
    const s = summaryOf(inputs({ glucose: glucose([100, 120], 2) }), null);
    expect(s.hasData).toBe(false);
    expect(s.comparable).toBe(false);
    expect(weeklySummaryText(s)).toContain("Dados insuficientes");
  });

  it("compara com a semana anterior quando as DUAS têm dado", () => {
    const current = inputs({ glucose: glucose([100, 110, 120, 130, 140, 150, 160, 90]) });
    const previous = inputs({ glucose: glucose([200, 210, 190, 220, 100, 110, 230, 240]) });
    const s = summaryOf(current, previous);

    expect(s.hasData).toBe(true);
    expect(s.comparable).toBe(true);
    expect(s.tirPercent.current).toBe(100);
    expect(s.tirPercent.delta).toBeGreaterThan(0);
    expect(s.highlights.some((h) => h.id === "tir_up")).toBe(true);
  });

  it("semana anterior fraca não vira comparação", () => {
    const current = inputs({ glucose: glucose([100, 110, 120, 130, 140, 150, 160, 90]) });
    const previous = inputs({ glucose: glucose([120, 130], 2) });
    const s = summaryOf(current, previous);

    expect(s.hasData).toBe(true);
    expect(s.comparable).toBe(false);
    // Sem comparação, nenhum destaque de tendência de TIR.
    expect(s.highlights.some((h) => h.id.startsWith("tir_"))).toBe(false);
    expect(weeklySummaryText(s)).toContain("não tinha registros suficientes");
  });

  it("variação de TIR dentro da margem é lida como estável", () => {
    // 7 de 8 no alvo nas duas semanas — mesma TIR.
    const week = () => inputs({ glucose: glucose([100, 110, 120, 130, 140, 150, 160, 90]) });
    const s = summaryOf(week(), week());
    expect(s.tirPercent.delta).toBe(0);
    expect(s.highlights.some((h) => h.id === "tir_stable")).toBe(true);
  });

  it("hipoglicemia aparece mesmo isolada e mesmo sem semana anterior", () => {
    const s = summaryOf(
      inputs({ glucose: glucose([100, 110, 120, 130, 140, 150, 160, 60]) }),
      null
    );
    const hypo = s.highlights.find((h) => h.id === "hypos");
    expect(hypo).toBeDefined();
    expect(hypo!.tone).toBe("atencao");
    // É o primeiro da lista: risco imediato vem antes de tendência.
    expect(s.highlights[0].id).toBe("hypos");
  });

  it("delta sabe quando menor é melhor", () => {
    const current = inputs({ glucose: glucose([100, 110, 120, 130, 140, 150, 160, 60]) });
    const previous = inputs({ glucose: glucose([100, 110, 60, 65, 140, 150, 160, 60]) });
    const s = summaryOf(current, previous);
    expect(s.hypoCount.lowerIsBetter).toBe(true);
    expect(s.hypoCount.delta).toBeLessThan(0);
  });

  it("separa acima da meta de hiperglicemia severa", () => {
    const s = summaryOf(
      inputs({ glucose: glucose([100, 110, 120, 130, 200, 210, 260, 90]) }),
      null
    );
    expect(s.hyperCount.current).toBe(3);
    expect(s.severeHyperCount.current).toBe(1);
    expect(s.highlights.some((h) => h.id === "severe_hyper")).toBe(true);
  });
});

describe("weeklySummaryText", () => {
  it("traz números, destaques e a ressalva de que não é laudo", () => {
    const s = summaryOf(
      inputs({
        glucose: glucose([100, 110, 120, 130, 140, 150, 160, 90]),
        exercises: [
          { duration_min: 30, started_at: "2026-07-10T07:00:00Z", day: "2026-07-10" },
          { duration_min: 40, started_at: "2026-07-12T07:00:00Z", day: "2026-07-12" },
          { duration_min: 25, started_at: "2026-07-14T07:00:00Z", day: "2026-07-14" },
        ],
      }),
      null
    );
    const text = weeklySummaryText(s);
    expect(text).toContain("GLYX — resumo da semana");
    expect(text).toContain("Tempo no alvo");
    expect(text).toContain("Faixa alvo: 70–180 mg/dL");
    expect(text).toContain("DESTAQUES");
    expect(text).toContain("não substitui avaliação médica");
  });
});
