import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRawInputs } from "@/lib/audit/metrics";
import { countAlteredSignals } from "@/lib/exams/types";
import type { HealthSnapshotSource } from "@/lib/health/types";
import { localDateKey } from "@/lib/time/local-day";

const SRC: HealthSnapshotSource[] = ["manual", "apple_health", "google_fit", "mock"];

type ProfileTargets = {
  timezone: string | null;
  target_glucose_min: number | null;
  target_glucose_max: number | null;
};

/**
 * Carrega e normaliza eventos por dia local do perfil para a auditoria.
 */
export async function loadAuditDayGrid(
  supabase: SupabaseClient,
  userId: string,
  windowDays: number
): Promise<{
  inputs: AuditRawInputs;
  periodStart: string;
  periodEnd: string;
  timezone: string | null;
}> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, target_glucose_min, target_glucose_max")
    .eq("id", userId)
    .maybeSingle();

  const p = (profile ?? null) as ProfileTargets | null;
  const timezone = p?.timezone ?? null;
  const targetMin = p?.target_glucose_min ?? 70;
  const targetMax = p?.target_glucose_max ?? 180;

  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const sinceIso = since.toISOString();
  const dayStart = localDateKey(sinceIso, timezone);
  const periodEnd = localDateKey(new Date().toISOString(), timezone);

  const [gRes, mRes, eRes, hRes, wRes, medRes, insRes, weightRes, examRes] = await Promise.all([
    supabase
      .from("glucose_readings")
      .select("value_mg_dl, recorded_at")
      .eq("user_id", userId)
      .gte("recorded_at", sinceIso)
      .order("recorded_at", { ascending: true }),
    supabase
      .from("meals")
      .select("carbs_g, glucose_spike, eaten_at")
      .eq("user_id", userId)
      .gte("eaten_at", sinceIso),
    supabase
      .from("exercise_sessions")
      .select("duration_min, started_at")
      .eq("user_id", userId)
      .gte("started_at", sinceIso),
    supabase
      .from("health_snapshots")
      .select("snapshot_date, source, sleep_hours")
      .eq("user_id", userId)
      .gte("snapshot_date", dayStart),
    supabase
      .from("water_logs")
      .select("amount_ml, kind, logged_at")
      .eq("user_id", userId)
      .gte("logged_at", sinceIso),
    supabase
      .from("medication_logs")
      .select("taken_at")
      .eq("user_id", userId)
      .gte("taken_at", sinceIso),
    supabase
      .from("insulin_logs")
      .select("units, applied_at")
      .eq("user_id", userId)
      .gte("applied_at", sinceIso),
    supabase
      .from("weight_logs")
      .select("weight_kg, logged_on")
      .eq("user_id", userId)
      .gte("logged_on", dayStart)
      .order("logged_on", { ascending: true }),
    supabase
      .from("exams")
      .select("parsed_summary, created_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const glucose = (gRes.data ?? []).map((r) => ({
    value_mg_dl: Number(r.value_mg_dl),
    recorded_at: r.recorded_at as string,
    day: localDateKey(r.recorded_at as string, timezone),
  }));

  const meals = (mRes.data ?? []).map((r) => ({
    carbs_g: r.carbs_g != null ? Number(r.carbs_g) : null,
    glucose_spike: (r.glucose_spike as boolean | null) ?? null,
    eaten_at: r.eaten_at as string,
    day: localDateKey(r.eaten_at as string, timezone),
  }));

  const exercises = (eRes.data ?? []).map((r) => ({
    duration_min: r.duration_min != null ? Number(r.duration_min) : null,
    started_at: r.started_at as string,
    day: localDateKey(r.started_at as string, timezone),
  }));

  const sleepByDate = new Map<string, number | null>();
  const sleepRows = hRes.error ? [] : (hRes.data ?? []);
  const byDate = new Map<string, typeof sleepRows>();
  for (const row of sleepRows) {
    const d = row.snapshot_date as string;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(row);
  }
  for (const [d, rows] of byDate) {
    let hours: number | null = null;
    for (const src of SRC) {
      const r = rows.find((x) => x.source === src);
      if (r?.sleep_hours != null) {
        hours = Number(r.sleep_hours);
        break;
      }
    }
    sleepByDate.set(d, hours);
  }
  const sleepDays = [...sleepByDate.entries()].map(([day, hours]) => ({ day, hours }));

  const waterByDay = new Map<string, number>();
  for (const w of wRes.data ?? []) {
    const kind = (w.kind as string | null) ?? "agua";
    if (kind !== "agua" && kind !== "agua_com_gas" && kind !== "cha") continue;
    const day = localDateKey(w.logged_at as string, timezone);
    waterByDay.set(day, (waterByDay.get(day) ?? 0) + Number(w.amount_ml ?? 0));
  }
  const waterDays = [...waterByDay.entries()].map(([day, ml]) => ({ day, ml }));

  const medLogs = (medRes.data ?? []).map((r) => ({
    taken_at: r.taken_at as string,
    day: localDateKey(r.taken_at as string, timezone),
  }));

  const insulin = (insRes.error ? [] : insRes.data ?? []).map((r) => ({
    units: Number(r.units),
    applied_at: r.applied_at as string,
    day: localDateKey(r.applied_at as string, timezone),
  }));

  const weights = (weightRes.data ?? []).map((r) => ({
    weight_kg: Number(r.weight_kg),
    logged_on: r.logged_on as string,
  }));

  let examAlteredCount = 0;
  for (const exam of examRes.data ?? []) {
    examAlteredCount += countAlteredSignals(exam.parsed_summary);
  }

  return {
    timezone,
    periodStart: dayStart,
    periodEnd,
    inputs: {
      windowDays,
      targetMin,
      targetMax,
      glucose,
      meals,
      exercises,
      sleepDays,
      waterDays,
      medLogs,
      insulin,
      weights,
      examAlteredCount,
    },
  };
}
