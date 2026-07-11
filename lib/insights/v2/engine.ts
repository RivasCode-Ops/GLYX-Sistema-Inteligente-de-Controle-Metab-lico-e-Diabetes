import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInsightDatasets } from "@/lib/insights/v2/datasets";

export type CorrelationFinding = {
  slug: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  metrics: Record<string, unknown>;
};

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Motor heurístico v2 — correlações descritivas (não inferência causal).
 * Requer dados suficientes em `glucose_readings` e tabelas auxiliares.
 */
export async function runCorrelationEngine(
  supabase: SupabaseClient,
  userId: string,
  windowDays: number = 14
): Promise<CorrelationFinding[]> {
  const { byDayGlucose, byDaySleep, byDayCarbs, byDayExercise } = await loadInsightDatasets(
    supabase,
    userId,
    windowDays
  );

  const findings: CorrelationFinding[] = [];

  const days = [...new Set([...byDayGlucose.keys(), ...byDaySleep.keys()])].sort();

  /* --- Sono vs glicemia média diária --- */
  const lowSleepAvgs: number[] = [];
  const highSleepAvgs: number[] = [];

  for (const day of days) {
    const gl = byDayGlucose.get(day);
    const sh = byDaySleep.get(day);
    if (!gl || sh == null) continue;
    if (sh < 6) lowSleepAvgs.push(gl.avg);
    else if (sh >= 7) highSleepAvgs.push(gl.avg);
  }

  const mLow = mean(lowSleepAvgs);
  const mHigh = mean(highSleepAvgs);
  if (
    mLow != null &&
    mHigh != null &&
    lowSleepAvgs.length >= 2 &&
    highSleepAvgs.length >= 2 &&
    Math.abs(mLow - mHigh) >= 10
  ) {
    const worse = mLow > mHigh ? "menos" : "mais";
    findings.push({
      slug: "sleep_vs_glucose_avg",
      title: "Sono e média glicémica",
      body: `Nos últimos ${windowDays} dias, dias com sono inferior a 6 h tiveram média ~${Math.round(mLow)} mg/dL e dias com pelo menos 7 h ~${Math.round(mHigh)} mg/dL (diferença ${Math.round(Math.abs(mLow - mHigh))}). Associação descritiva — confirme com o seu médico.`,
      severity: Math.abs(mLow - mHigh) >= 25 ? "warning" : "info",
      metrics: {
        daysLowSleep: lowSleepAvgs.length,
        daysHighSleep: highSleepAvgs.length,
        avgGlucoseLowSleep: mLow,
        avgGlucoseHighSleep: mHigh,
        worseWhenLessSleep: worse,
      },
    });
  }

  /* --- Carboidratos vs glicemia (dias com dados) --- */
  const carbDays: { day: string; carbs: number; gAvg: number }[] = [];
  for (const day of days) {
    const gl = byDayGlucose.get(day);
    const carbs = byDayCarbs.get(day) ?? 0;
    if (!gl || carbs <= 0) continue;
    carbDays.push({ day, carbs, gAvg: gl.avg });
  }
  carbDays.sort((a, b) => b.carbs - a.carbs);
  if (carbDays.length >= 6) {
    const top3 = carbDays.slice(0, 3);
    const bot3 = carbDays.slice(-3);
    const topAvg = mean(top3.map((x) => x.gAvg));
    const botAvg = mean(bot3.map((x) => x.gAvg));
    if (topAvg != null && botAvg != null && topAvg - botAvg >= 12) {
      findings.push({
        slug: "carbs_vs_glucose_avg",
        title: "Carga de carboidratos e glicemia",
        body: `Os 3 dias com mais carboidratos registados tiveram média glicémica ~${Math.round(topAvg)} mg/dL; os 3 dias com menos carga ~${Math.round(botAvg)} mg/dL. Avalie distribuição de refeições com a sua equipa.`,
        severity: topAvg - botAvg >= 25 ? "warning" : "info",
        metrics: { topCarbDays: top3.map((x) => x.day), lowCarbDays: bot3.map((x) => x.day), delta: topAvg - botAvg },
      });
    }
  }

  /* --- Exercício vs glicemia --- */
  const exHigh: number[] = [];
  const exLow: number[] = [];
  for (const day of days) {
    const gl = byDayGlucose.get(day);
    const ex = byDayExercise.get(day) ?? 0;
    if (!gl) continue;
    if (ex >= 15) exHigh.push(gl.avg);
    else exLow.push(gl.avg);
  }
  const mxH = mean(exHigh);
  const mxL = mean(exLow);
  if (
    mxH != null &&
    mxL != null &&
    exHigh.length >= 2 &&
    exLow.length >= 2 &&
    Math.abs(mxH - mxL) >= 10
  ) {
    findings.push({
      slug: "exercise_vs_glucose_avg",
      title: "Atividade e média glicémica",
      body: `Dias com ≥ 15 min de exercício registado: média ~${Math.round(mxH)} mg/dL; dias mais sedentários: ~${Math.round(mxL)} mg/dL. Contextualize com insulinização/medicação junto do médico.`,
      severity: "info",
      metrics: {
        activeDays: exHigh.length,
        sedentaryDays: exLow.length,
        avgGlucoseActive: mxH,
        avgGlucoseSedentary: mxL,
      },
    });
  }

  return findings;
}

export async function persistFindings(
  supabase: SupabaseClient,
  userId: string,
  findings: CorrelationFinding[]
): Promise<{ upserted: number; error?: string }> {
  if (findings.length === 0) return { upserted: 0 };

  const rows = findings.map((f) => ({
    user_id: userId,
    slug: f.slug,
    title: f.title,
    body: f.body,
    severity: f.severity,
    metrics: f.metrics,
    computed_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("insight_findings").upsert(rows, {
    onConflict: "user_id,slug",
  });

  if (error) return { upserted: 0, error: error.message };
  return { upserted: rows.length };
}
