import { describe, expect, it } from "vitest";
import { computeAuditMetrics, type AuditRawInputs } from "@/lib/audit/metrics";
import { scoreFromMetrics } from "@/lib/audit/score";
import { buildWeeklySummary } from "@/lib/audit/weekly-summary";
import { computeGlucoseMetrics } from "@/lib/health/glucose-metrics";
import { classifyGlucose } from "@/lib/health/glucose-thresholds";
import { computeHourlyPattern } from "@/lib/insights/hourly-pattern";
import { aggregateGlucoseByDay, summarizeGlucose } from "@/lib/reports/full-history";

// Etapa 2 (verdade única): para o MESMO conjunto de leituras, todos os motores
// devolvem o mesmo TIR, a mesma contagem de hipo e o mesmo CV.

const META = { targetMin: 70, targetMax: 180 };
const TZ = "America/Sao_Paulo";

/** Série de sensor a cada 5 min a partir de `inicio`, com os valores dados. */
function serie(inicio: string, valores: number[]) {
  const t0 = new Date(inicio).getTime();
  return valores.map((v, i) => ({
    value_mg_dl: v,
    recorded_at: new Date(t0 + i * 5 * 60_000).toISOString(),
  }));
}

// 4 dias: uma hipo de 2h15 (27 leituras abaixo), uma hiper longa, leituras
// exatamente em 70 e 180 (os limites) e o resto na faixa.
const leituras = [
  ...serie("2026-10-20T09:00:00Z", [120, 130, 180, 180, 150, ...Array(27).fill(62), 90, 95, 100, 105]),
  ...serie("2026-10-21T15:00:00Z", [70, 70, 110, ...Array(30).fill(220), 160, 150, 140, 130]),
  ...serie("2026-10-22T12:00:00Z", [100, 110, 120, 130, 140, 150]),
  ...serie("2026-10-23T12:00:00Z", [181, 179, 69, 71, 100]),
];

function entradaAuditoria(): AuditRawInputs {
  return {
    windowDays: 7,
    ...META,
    glucose: leituras.map((l) => ({
      ...l,
      day: new Date(l.recorded_at).toLocaleDateString("en-CA", { timeZone: TZ }),
    })),
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

describe("coerência entre motores de glicemia", () => {
  const cgm = computeGlucoseMetrics(leituras, META, TZ);
  const auditoria = computeAuditMetrics(entradaAuditoria());
  const historico = summarizeGlucose(aggregateGlucoseByDay(leituras, TZ, META.targetMin, META.targetMax))!;

  it("TIR igual no painel/relatório, na auditoria e no histórico completo", () => {
    expect(auditoria.tirPercent).toBe(cgm.tirPercent);
    expect(historico.tirPercent).toBe(cgm.tirPercent);
  });

  it("contagem de leituras abaixo e acima igual", () => {
    const abaixo = Math.round(((cgm.tbrPercent ?? 0) / 100) * cgm.readings);
    const acima = Math.round(((cgm.tarPercent ?? 0) / 100) * cgm.readings);
    expect(auditoria.hypoCount).toBe(abaixo);
    expect(historico.below).toBe(abaixo);
    expect(auditoria.hyperCount).toBe(acima);
    expect(historico.above).toBe(acima);
  });

  it("episódios iguais: 27 leituras consecutivas abaixo = 1 episódio", () => {
    expect(cgm.hipoEpisodes).toBe(1);
    expect(auditoria.hypoEpisodes).toBe(1);
    expect(auditoria.hyperEpisodes).toBe(cgm.hiperEpisodes);
  });

  it("CV igual (desvio amostral, uma casa)", () => {
    expect(auditoria.cvPercent).toBe(cgm.cvPercent);
  });

  it("o resumo semanal destaca episódios, não leituras", () => {
    const s = buildWeeklySummary({
      metrics: auditoria,
      previousMetrics: null,
      periodStart: "2026-10-17",
      periodEnd: "2026-10-23",
      ...META,
    });
    const hipo = s.highlights.find((h) => h.id === "hypos")!;
    expect(hipo.text).toMatch(/^1 episódio abaixo/);
    expect(s.hypoEpisodes.current).toBe(1);
  });

  it("o score desconta 1 episódio de hipo, não 27 leituras", () => {
    const fator = scoreFromMetrics(auditoria, "2026-10-17", "2026-10-23").factors.find(
      (f) => f.id === "hypos"
    )!;
    expect(fator.scoreImpact).toBe(6);
    expect(fator.severity).toBe("warning");
  });
});

describe("a régua de limite é uma só", () => {
  it("180 com meta 70–180 está na meta em todos os motores; 181 está acima", () => {
    expect(classifyGlucose(180, META).inRange).toBe(true);
    expect(classifyGlucose(181, META).zone).toBe("acima");
    const pontos = serie("2026-10-20T12:00:00Z", [180, 180, 180, 180]);
    expect(computeGlucoseMetrics(pontos, META, TZ).tarPercent).toBe(0);
    expect(computeHourlyPattern(pontos, TZ, META.targetMax)[0].pctAbove).toBe(0);
    expect(summarizeGlucose(aggregateGlucoseByDay(pontos, TZ, 70, 180))!.above).toBe(0);
  });

  it("70 está na meta; 69 está abaixo", () => {
    expect(classifyGlucose(70, META).inRange).toBe(true);
    expect(classifyGlucose(69, META).zone).toBe("abaixo");
  });
});
