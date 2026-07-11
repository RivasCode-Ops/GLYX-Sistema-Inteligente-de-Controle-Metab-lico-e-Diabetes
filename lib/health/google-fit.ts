import type { UnifiedHealthSnapshot } from "@/lib/health/types";

/**
 * Normaliza um payload simplificado estilo Google Fit / Health Connect (agregado por dia).
 * Formas reais da API Google são mais ricas — expandir quando ligar OAuth.
 *
 * Exemplo:
 * ```json
 * { "date": "2026-01-09", "steps": 8420, "sleepHours": 7.2, "heartRateResting": 62 }
 * ```
 */
export type GoogleFitDailyLike = {
  date?: string;
  steps?: number;
  sleepHours?: number;
  sleep_hours?: number;
  heartRateResting?: number;
  resting_hr?: number;
  activeCalories?: number;
  active_calories?: number;
  stressScore?: number;
};

export function normalizeGoogleFitDaily(rows: GoogleFitDailyLike[]): UnifiedHealthSnapshot[] {
  const out: UnifiedHealthSnapshot[] = [];
  for (const row of rows) {
    const date = row.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({
      snapshotDate: date,
      source: "google_fit",
      steps: row.steps ?? null,
      sleepHours: row.sleepHours ?? row.sleep_hours ?? null,
      restingHr: row.heartRateResting ?? row.resting_hr ?? null,
      activeCalories: row.activeCalories ?? row.active_calories ?? null,
      stressScore: row.stressScore ?? null,
      metadata: { raw: row },
    });
  }
  return out;
}
