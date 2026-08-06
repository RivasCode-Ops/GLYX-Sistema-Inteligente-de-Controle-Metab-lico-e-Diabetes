import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveGlucoseTargets, SEVERE_HYPER_MG_DL } from "@/lib/health/glucose-thresholds";
import { localDateKey } from "@/lib/time/local-day";
import { BODY_FIELD_KEYS, type BodyMeasurementKey } from "@/lib/body/fields";
import { BEVERAGE_META, isBeverageKind, isHydrating } from "@/lib/health/beverages";

/**
 * Diário completo: tudo que o usuário registrou, do primeiro dia até hoje.
 *
 * Diferente de `lib/audit/medical-report.ts`, que resume uma janela curta em
 * indicadores para o médico ler em 90s. Aqui o objetivo é o oposto — o registro
 * integral, para o próprio usuário arquivar, levar impresso ou entregar a quem
 * pedir o histórico inteiro. O export LGPD (`/api/me/export`) já fazia isso em
 * JSON; isto é a mesma completude em forma legível.
 *
 * Só a glicemia é agregada, e por necessidade física: o CGM grava a cada ~5min,
 * o que dá milhares de leituras por mês. Listada linha a linha ela sozinha
 * ocuparia dezenas de páginas e afogaria todo o resto do documento. Vira uma
 * linha por dia com mínima/média/máxima e tempo no alvo; os eventos que
 * importam (hipo e hiper severa) continuam listados individualmente. Todo o
 * resto — refeição, dose, treino, medida, água — aparece registro a registro.
 */

/** Leituras que representam medição real do usuário. `mock` é dado de
 * demonstração (`lib/demo/data.ts`) e fica FORA de qualquer número do relatório:
 * misturar semente de demo com leitura de sensor num documento que pode ir para
 * o médico é o tipo de erro que não se percebe olhando. Ele é contado à parte e
 * declarado no cabeçalho. */
export const REAL_GLUCOSE_SOURCES = ["libre", "dexcom", "manual", "csv"] as const;

export function isRealGlucoseSource(source: string | null | undefined): boolean {
  return (REAL_GLUCOSE_SOURCES as readonly string[]).includes(source ?? "");
}

const GLUCOSE_SOURCE_LABEL: Record<string, string> = {
  libre: "FreeStyle Libre",
  dexcom: "Dexcom",
  manual: "Digitado por você",
  csv: "Importação CSV (LibreView)",
  mock: "Demonstração",
};

export function glucoseSourceLabel(source: string | null | undefined): string {
  if (!source) return "Origem não informada";
  return GLUCOSE_SOURCE_LABEL[source] ?? source;
}

// ---------------------------------------------------------------------------
// Linhas cruas
// ---------------------------------------------------------------------------

export type GlucoseRow = {
  recorded_at: string;
  value_mg_dl: number;
  source: string | null;
  context: string | null;
  notes: string | null;
};

export type MealRow = {
  eaten_at: string;
  name: string | null;
  calories: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  glycemic_load_estimate: number | null;
  glucose_spike: boolean | null;
  photo_path: string | null;
  notes: string | null;
};

export type WaterRow = { logged_at: string; amount_ml: number; kind: string | null };

export type MedicationRow = {
  id: string;
  name: string;
  dosage: string | null;
  kind: string | null;
  active: boolean | null;
  reminder_times: string[] | null;
  stock_units: number | null;
  schedule_hint: string | null;
  notes: string | null;
  created_at: string;
};

export type MedicationLogRow = { medication_id: string | null; taken_at: string };

export type InsulinRow = {
  applied_at: string;
  units: number;
  insulin_kind: string | null;
  reason: string | null;
  glucose_mg_dl: number | null;
  notes: string | null;
};

export type ExerciseRow = {
  started_at: string;
  label: string | null;
  duration_min: number | null;
  calories_burned: number | null;
  intensity: string | null;
  activity_type: string | null;
  muscle_groups: string[] | null;
  notes: string | null;
};

export type StrengthRow = {
  logged_at: string;
  exercise_name: string;
  muscle_group: string | null;
  weight_kg: number | null;
  reps: number | null;
  sets: number | null;
};

export type MusclePauseRow = {
  muscle_group: string;
  reason: string | null;
  paused_at: string;
  resumed_at: string | null;
};

export type WeightRow = { logged_on: string; weight_kg: number };

export type MeasurementRow = { measured_on: string; notes: string | null } & Partial<
  Record<BodyMeasurementKey, number | null>
>;

export type BodyGoalRow = {
  metric: string;
  target_value: number | null;
  start_value: number | null;
  start_on: string | null;
  target_date: string | null;
};

export type PressureRow = {
  recorded_at: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  notes: string | null;
};

export type ExamRow = {
  created_at: string;
  title: string | null;
  lab_name: string | null;
  exam_type: string | null;
  parsed_summary: unknown;
};

export type AlertRow = {
  created_at: string;
  severity: string | null;
  title: string | null;
  body: string | null;
  read_at: string | null;
};

export type SnapshotRow = {
  snapshot_date: string;
  source: string | null;
  steps: number | null;
  sleep_hours: number | null;
  resting_hr: number | null;
  active_calories: number | null;
};

// ---------------------------------------------------------------------------
// Agregações puras (testáveis sem banco)
// ---------------------------------------------------------------------------

export type GlucoseDay = {
  day: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  below: number;
  above: number;
  severe: number;
  /** Percentual de leituras dentro da faixa-alvo naquele dia. */
  tirPercent: number;
};

export type GlucoseOverall = {
  count: number;
  min: number;
  max: number;
  avg: number;
  below: number;
  above: number;
  severe: number;
  tirPercent: number;
  daysWithData: number;
};

function round(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Uma linha por dia local, ordenada da mais antiga para a mais recente. */
export function aggregateGlucoseByDay(
  readings: Pick<GlucoseRow, "recorded_at" | "value_mg_dl">[],
  timezone: string | null | undefined,
  targetMin: number,
  targetMax: number
): GlucoseDay[] {
  const byDay = new Map<string, number[]>();
  for (const r of readings) {
    const value = Number(r.value_mg_dl);
    if (!Number.isFinite(value)) continue;
    const day = localDateKey(r.recorded_at, timezone);
    const list = byDay.get(day);
    if (list) list.push(value);
    else byDay.set(day, [value]);
  }

  return [...byDay.entries()]
    .map(([day, values]) => {
      let sum = 0;
      let below = 0;
      let above = 0;
      let severe = 0;
      let min = values[0];
      let max = values[0];
      for (const v of values) {
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
        if (v < targetMin) below += 1;
        else if (v > targetMax) above += 1;
        if (v >= SEVERE_HYPER_MG_DL) severe += 1;
      }
      const inRange = values.length - below - above;
      return {
        day,
        count: values.length,
        min,
        max,
        avg: round(sum / values.length),
        below,
        above,
        severe,
        tirPercent: round((inRange / values.length) * 100),
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Consolidado do período inteiro. `null` quando não há nenhuma leitura. */
export function summarizeGlucose(days: GlucoseDay[]): GlucoseOverall | null {
  if (days.length === 0) return null;
  let count = 0;
  let weightedSum = 0;
  let below = 0;
  let above = 0;
  let severe = 0;
  let min = days[0].min;
  let max = days[0].max;
  for (const d of days) {
    count += d.count;
    // Média ponderada pela contagem do dia — média de médias diárias daria peso
    // igual a um dia com 3 leituras e a um com 288.
    weightedSum += d.avg * d.count;
    below += d.below;
    above += d.above;
    severe += d.severe;
    if (d.min < min) min = d.min;
    if (d.max > max) max = d.max;
  }
  const inRange = count - below - above;
  return {
    count,
    min,
    max,
    avg: round(weightedSum / count),
    below,
    above,
    severe,
    tirPercent: round((inRange / count) * 100),
    daysWithData: days.length,
  };
}

export type GlucoseEvent = { recordedAt: string; value: number; kind: "hipo" | "hiper" };

/** Hipoglicemias e hiperglicemias severas, individualmente — os únicos eventos
 * de glicemia que continuam listados leitura a leitura. */
export function extractGlucoseEvents(
  readings: Pick<GlucoseRow, "recorded_at" | "value_mg_dl">[],
  targetMin: number
): GlucoseEvent[] {
  const events: GlucoseEvent[] = [];
  for (const r of readings) {
    const value = Number(r.value_mg_dl);
    if (!Number.isFinite(value)) continue;
    if (value < targetMin) events.push({ recordedAt: r.recorded_at, value, kind: "hipo" });
    else if (value >= SEVERE_HYPER_MG_DL)
      events.push({ recordedAt: r.recorded_at, value, kind: "hiper" });
  }
  return events.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export type WaterDayKind = { kind: string; label: string; ml: number; count: number };
export type WaterDay = { day: string; totalMl: number; hydratingMl: number; kinds: WaterDayKind[] };

export function aggregateWaterByDay(
  logs: WaterRow[],
  timezone: string | null | undefined
): WaterDay[] {
  const byDay = new Map<string, Map<string, { ml: number; count: number }>>();
  for (const l of logs) {
    const day = localDateKey(l.logged_at, timezone);
    const kind = l.kind ?? "outra";
    const kinds = byDay.get(day) ?? new Map<string, { ml: number; count: number }>();
    const cur = kinds.get(kind) ?? { ml: 0, count: 0 };
    cur.ml += Number(l.amount_ml) || 0;
    cur.count += 1;
    kinds.set(kind, cur);
    byDay.set(day, kinds);
  }

  return [...byDay.entries()]
    .map(([day, kinds]) => {
      const list: WaterDayKind[] = [...kinds.entries()]
        .map(([kind, v]) => ({
          kind,
          label: isBeverageKind(kind) ? BEVERAGE_META[kind].label : kind,
          ml: v.ml,
          count: v.count,
        }))
        .sort((a, b) => b.ml - a.ml);
      return {
        day,
        totalMl: list.reduce((acc, k) => acc + k.ml, 0),
        // Só água, água com gás e chá contam para a meta (lib/health/beverages.ts).
        hydratingMl: list.reduce((acc, k) => acc + (isHydrating(k.kind) ? k.ml : 0), 0),
        kinds: list,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));
}

export type MedicationLogDay = { day: string; entries: { name: string; takenAt: string }[] };

export function groupMedicationLogsByDay(
  logs: MedicationLogRow[],
  nameById: Map<string, string>,
  timezone: string | null | undefined
): MedicationLogDay[] {
  const byDay = new Map<string, { name: string; takenAt: string }[]>();
  for (const l of logs) {
    const day = localDateKey(l.taken_at, timezone);
    const name = (l.medication_id ? nameById.get(l.medication_id) : null) ?? "(medicamento removido)";
    const list = byDay.get(day) ?? [];
    list.push({ name, takenAt: l.taken_at });
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .map(([day, entries]) => ({
      day,
      entries: entries.sort((a, b) => a.takenAt.localeCompare(b.takenAt)),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Menor data (YYYY-MM-DD) entre as candidatas, ignorando vazias. */
export function earliestDay(candidates: (string | null | undefined)[]): string | null {
  let earliest: string | null = null;
  for (const c of candidates) {
    if (!c) continue;
    if (earliest === null || c < earliest) earliest = c;
  }
  return earliest;
}

/** Dias corridos entre duas datas locais, inclusive nas duas pontas. */
export function daysBetweenInclusive(startDay: string, endDay: string): number {
  const [ys, ms, ds] = startDay.split("-").map(Number);
  const [ye, me, de] = endDay.split("-").map(Number);
  const diff = Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds);
  return Math.floor(diff / 86400000) + 1;
}

// ---------------------------------------------------------------------------
// Leitura do banco
// ---------------------------------------------------------------------------

/**
 * PostgREST devolve no máximo 1000 linhas por requisição — silenciosamente, sem
 * erro. Um relatório "desde o dia 0" que perdesse a partir da leitura 1001 seria
 * um documento errado com aparência de completo, e a glicemia sozinha já passa
 * de 3000 linhas em um mês de CGM.
 */
const PAGE_SIZE = 1000;

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  orderColumn: string
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) break;
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export type FullHistoryProfile = {
  fullName: string | null;
  email: string | null;
  diabetesType: string | null;
  sex: string | null;
  birthYear: number | null;
  heightCm: number | null;
  activityLevel: string | null;
  bodyGoal: string | null;
  primaryFocus: string | null;
  targetWeightKg: number | null;
  carbRatio: number | null;
  correctionFactor: number | null;
  timezone: string;
};

export type FullHistoryReport = {
  profile: FullHistoryProfile;
  targetMin: number;
  targetMax: number;
  generatedAt: string;
  /** Primeiro dia com qualquer registro; `null` se o usuário nunca registrou nada. */
  firstDay: string | null;
  lastDay: string;
  totalDays: number;
  glucose: {
    days: GlucoseDay[];
    overall: GlucoseOverall | null;
    events: GlucoseEvent[];
    bySource: { source: string; label: string; count: number }[];
    /** Leituras de demonstração, excluídas de todos os números acima. */
    demoCount: number;
  };
  meals: MealRow[];
  water: WaterDay[];
  medications: MedicationRow[];
  medicationLogDays: MedicationLogDay[];
  medicationLogCount: number;
  insulin: InsulinRow[];
  exercises: ExerciseRow[];
  strength: StrengthRow[];
  musclePauses: MusclePauseRow[];
  weights: WeightRow[];
  measurements: MeasurementRow[];
  bodyGoals: BodyGoalRow[];
  pressure: PressureRow[];
  exams: ExamRow[];
  alerts: AlertRow[];
  snapshots: SnapshotRow[];
};

const MEASUREMENT_COLUMNS = ["measured_on", "notes", ...BODY_FIELD_KEYS].join(", ");

export async function buildFullHistoryReport(
  supabase: SupabaseClient,
  userId: string
): Promise<FullHistoryReport> {
  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "full_name, email, diabetes_type, sex, birth_year, height_cm, activity_level, body_goal, primary_focus, target_weight_kg, carb_ratio, correction_factor, target_glucose_min, target_glucose_max, timezone"
    )
    .eq("id", userId)
    .maybeSingle();

  const tz = (profileRow?.timezone as string | null) || "America/Sao_Paulo";
  const { targetMin, targetMax } = resolveGlucoseTargets(profileRow);

  const [
    glucoseRows,
    meals,
    waterRows,
    medications,
    medicationLogs,
    insulin,
    exercises,
    strength,
    musclePauses,
    weights,
    measurements,
    bodyGoals,
    pressure,
    exams,
    alerts,
    snapshots,
  ] = await Promise.all([
    fetchAll<GlucoseRow>(
      supabase,
      "glucose_readings",
      "recorded_at, value_mg_dl, source, context, notes",
      userId,
      "recorded_at"
    ),
    fetchAll<MealRow>(
      supabase,
      "meals",
      "eaten_at, name, calories, carbs_g, protein_g, fat_g, glycemic_load_estimate, glucose_spike, photo_path, notes",
      userId,
      "eaten_at"
    ),
    fetchAll<WaterRow>(supabase, "water_logs", "logged_at, amount_ml, kind", userId, "logged_at"),
    fetchAll<MedicationRow>(
      supabase,
      "medications",
      "id, name, dosage, kind, active, reminder_times, stock_units, schedule_hint, notes, created_at",
      userId,
      "created_at"
    ),
    fetchAll<MedicationLogRow>(
      supabase,
      "medication_logs",
      "medication_id, taken_at",
      userId,
      "taken_at"
    ),
    fetchAll<InsulinRow>(
      supabase,
      "insulin_logs",
      "applied_at, units, insulin_kind, reason, glucose_mg_dl, notes",
      userId,
      "applied_at"
    ),
    fetchAll<ExerciseRow>(
      supabase,
      "exercise_sessions",
      "started_at, label, duration_min, calories_burned, intensity, activity_type, muscle_groups, notes",
      userId,
      "started_at"
    ),
    fetchAll<StrengthRow>(
      supabase,
      "strength_logs",
      "logged_at, exercise_name, muscle_group, weight_kg, reps, sets",
      userId,
      "logged_at"
    ),
    fetchAll<MusclePauseRow>(
      supabase,
      "muscle_pauses",
      "muscle_group, reason, paused_at, resumed_at",
      userId,
      "paused_at"
    ),
    fetchAll<WeightRow>(supabase, "weight_logs", "logged_on, weight_kg", userId, "logged_on"),
    fetchAll<MeasurementRow>(supabase, "body_measurements", MEASUREMENT_COLUMNS, userId, "measured_on"),
    fetchAll<BodyGoalRow>(
      supabase,
      "body_goals",
      "metric, target_value, start_value, start_on, target_date",
      userId,
      "metric"
    ),
    fetchAll<PressureRow>(
      supabase,
      "blood_pressure_logs",
      "recorded_at, systolic, diastolic, pulse, notes",
      userId,
      "recorded_at"
    ),
    fetchAll<ExamRow>(
      supabase,
      "exams",
      "created_at, title, lab_name, exam_type, parsed_summary",
      userId,
      "created_at"
    ),
    fetchAll<AlertRow>(
      supabase,
      "metabolic_alerts",
      "created_at, severity, title, body, read_at",
      userId,
      "created_at"
    ),
    fetchAll<SnapshotRow>(
      supabase,
      "health_snapshots",
      "snapshot_date, source, steps, sleep_hours, resting_hr, active_calories",
      userId,
      "snapshot_date"
    ),
  ]);

  const realReadings = glucoseRows.filter((r) => isRealGlucoseSource(r.source));
  const demoCount = glucoseRows.length - realReadings.length;

  const sourceCounts = new Map<string, number>();
  for (const r of glucoseRows) {
    const key = r.source ?? "desconhecida";
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }

  const glucoseDays = aggregateGlucoseByDay(realReadings, tz, targetMin, targetMax);
  const nameById = new Map(medications.map((m) => [m.id, m.name]));

  const lastDay = localDateKey(new Date().toISOString(), tz);
  const firstDay = earliestDay([
    glucoseDays[0]?.day,
    meals[0] ? localDateKey(meals[0].eaten_at, tz) : null,
    waterRows[0] ? localDateKey(waterRows[0].logged_at, tz) : null,
    medications[0] ? localDateKey(medications[0].created_at, tz) : null,
    medicationLogs[0] ? localDateKey(medicationLogs[0].taken_at, tz) : null,
    insulin[0] ? localDateKey(insulin[0].applied_at, tz) : null,
    exercises[0] ? localDateKey(exercises[0].started_at, tz) : null,
    strength[0] ? localDateKey(strength[0].logged_at, tz) : null,
    weights[0]?.logged_on,
    measurements[0]?.measured_on,
    pressure[0] ? localDateKey(pressure[0].recorded_at, tz) : null,
    exams[0] ? localDateKey(exams[0].created_at, tz) : null,
    alerts[0] ? localDateKey(alerts[0].created_at, tz) : null,
    snapshots[0]?.snapshot_date,
  ]);

  return {
    profile: {
      fullName: (profileRow?.full_name as string | null) ?? null,
      email: (profileRow?.email as string | null) ?? null,
      diabetesType: (profileRow?.diabetes_type as string | null) ?? null,
      sex: (profileRow?.sex as string | null) ?? null,
      birthYear: (profileRow?.birth_year as number | null) ?? null,
      heightCm: (profileRow?.height_cm as number | null) ?? null,
      activityLevel: (profileRow?.activity_level as string | null) ?? null,
      bodyGoal: (profileRow?.body_goal as string | null) ?? null,
      primaryFocus: (profileRow?.primary_focus as string | null) ?? null,
      targetWeightKg: (profileRow?.target_weight_kg as number | null) ?? null,
      carbRatio: (profileRow?.carb_ratio as number | null) ?? null,
      correctionFactor: (profileRow?.correction_factor as number | null) ?? null,
      timezone: tz,
    },
    targetMin,
    targetMax,
    generatedAt: new Date().toISOString(),
    firstDay,
    lastDay,
    totalDays: firstDay ? daysBetweenInclusive(firstDay, lastDay) : 0,
    glucose: {
      days: glucoseDays,
      overall: summarizeGlucose(glucoseDays),
      events: extractGlucoseEvents(realReadings, targetMin),
      bySource: [...sourceCounts.entries()]
        .map(([source, count]) => ({ source, label: glucoseSourceLabel(source), count }))
        .sort((a, b) => b.count - a.count),
      demoCount,
    },
    meals,
    water: aggregateWaterByDay(waterRows, tz),
    medications,
    medicationLogDays: groupMedicationLogsByDay(medicationLogs, nameById, tz),
    medicationLogCount: medicationLogs.length,
    insulin,
    exercises,
    strength,
    musclePauses,
    weights,
    measurements,
    bodyGoals,
    pressure,
    exams,
    alerts,
    snapshots,
  };
}
