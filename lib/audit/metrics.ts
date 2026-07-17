import type { AuditMetrics } from "@/lib/audit/types";

export type GlucoseSample = { value_mg_dl: number; recorded_at: string; day: string };
export type MealSample = {
  carbs_g: number | null;
  glucose_spike: boolean | null;
  eaten_at: string;
  day: string;
};
export type ExerciseSample = { duration_min: number | null; started_at: string; day: string };
export type SleepDay = { day: string; hours: number | null };
export type WaterDay = { day: string; ml: number };
export type MedLogSample = { taken_at: string; day: string };
export type InsulinSample = { units: number; applied_at: string; day: string };
export type WeightSample = { weight_kg: number; logged_on: string };

export type AuditRawInputs = {
  windowDays: number;
  targetMin: number;
  targetMax: number;
  glucose: GlucoseSample[];
  meals: MealSample[];
  exercises: ExerciseSample[];
  sleepDays: SleepDay[];
  waterDays: WaterDay[];
  medLogs: MedLogSample[];
  insulin: InsulinSample[];
  weights: WeightSample[];
  examAlteredCount: number;
};

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const m = mean(nums);
  if (m == null) return null;
  const variance = nums.reduce((acc, n) => acc + (n - m) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Agrega leituras e hábitos numa janela em métricas educacionais (TIR, hipos, etc.).
 */
export function computeAuditMetrics(input: AuditRawInputs): AuditMetrics {
  const values = input.glucose.map((g) => g.value_mg_dl);
  const daysWithGlucose = new Set(input.glucose.map((g) => g.day)).size;

  let inRange = 0;
  let hypoCount = 0;
  let hyperCount = 0;
  for (const v of values) {
    if (v < input.targetMin) hypoCount += 1;
    else if (v > input.targetMax) hyperCount += 1;
    else inRange += 1;
  }

  const tirPercent = values.length > 0 ? Math.round((inRange / values.length) * 1000) / 10 : null;
  const avgGlucose = mean(values);
  const sd = stdDev(values);

  const carbsByDay = new Map<string, number>();
  let spikeMealCount = 0;
  for (const m of input.meals) {
    carbsByDay.set(m.day, (carbsByDay.get(m.day) ?? 0) + (m.carbs_g ?? 0));
    if (m.glucose_spike) spikeMealCount += 1;
  }
  const carbTotals = [...carbsByDay.values()];
  const avgCarbsPerDay = mean(carbTotals);

  const exerciseByDay = new Map<string, number>();
  for (const e of input.exercises) {
    exerciseByDay.set(e.day, (exerciseByDay.get(e.day) ?? 0) + (e.duration_min ?? 0));
  }
  const activeDays = [...exerciseByDay.values()].filter((m) => m >= 15).length;
  const avgExerciseMin = mean([...exerciseByDay.values()]);

  const sleepHours = input.sleepDays
    .map((s) => s.hours)
    .filter((h): h is number => h != null && Number.isFinite(h));
  const avgSleepHours = mean(sleepHours);
  const lowSleepDays = input.sleepDays.filter((s) => s.hours != null && s.hours < 6).length;

  const waterDays = input.waterDays.filter((w) => w.ml >= 500).length;

  let weightDeltaKg: number | null = null;
  if (input.weights.length >= 2) {
    const sorted = [...input.weights].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
    weightDeltaKg = round1(sorted[sorted.length - 1]!.weight_kg - sorted[0]!.weight_kg);
  }

  return {
    windowDays: input.windowDays,
    readingCount: values.length,
    daysWithGlucose,
    tirPercent,
    hypoCount,
    hyperCount,
    avgGlucose: avgGlucose != null ? Math.round(avgGlucose) : null,
    stdDev: sd != null ? Math.round(sd) : null,
    avgCarbsPerDay: avgCarbsPerDay != null ? round1(avgCarbsPerDay) : null,
    spikeMealCount,
    activeDays,
    avgExerciseMin: avgExerciseMin != null ? Math.round(avgExerciseMin) : null,
    avgSleepHours: avgSleepHours != null ? round1(avgSleepHours) : null,
    lowSleepDays,
    waterDays,
    medLogCount: input.medLogs.length,
    insulinDoseCount: input.insulin.length,
    weightDeltaKg,
    examAlteredCount: input.examAlteredCount,
  };
}
