import type { UnifiedHealthSnapshot } from "@/lib/health/types";

/**
 * Normaliza exportação agregada (ex.: JSON gerado por atalho iOS ou backend bridge).
 * HealthKit em si não corre no browser.
 */
export type AppleHealthDailyLike = {
  date?: string;
  steps?: number;
  sleepHours?: number;
  restingHeartRate?: number;
  activeEnergy?: number;
};

export function normalizeAppleHealthDaily(rows: AppleHealthDailyLike[]): UnifiedHealthSnapshot[] {
  const out: UnifiedHealthSnapshot[] = [];
  for (const row of rows) {
    const date = row.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({
      snapshotDate: date,
      source: "apple_health",
      steps: row.steps ?? null,
      sleepHours: row.sleepHours ?? null,
      restingHr: row.restingHeartRate ?? null,
      activeCalories: row.activeEnergy ?? null,
      stressScore: null,
      metadata: { raw: row },
    });
  }
  return out;
}
