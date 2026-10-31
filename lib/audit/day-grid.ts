import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRawInputs } from "@/lib/audit/metrics";
import { countAlteredSignals } from "@/lib/exams/types";
import { resolveGlucoseTargets } from "@/lib/health/glucose-thresholds";
import type { HealthSnapshotSource } from "@/lib/health/types";
import { localDateKey, localDayRangeUTC } from "@/lib/time/local-day";
import { fetchAllRowsDetalhado } from "@/lib/queries/fetch-all";
import { FILTRO_SEM_DEMONSTRACAO } from "@/lib/queries/fetch-all";

// Sem "mock": demonstração fica fora de toda análise (B12).
const SRC: HealthSnapshotSource[] = ["manual", "apple_health", "google_fit"];

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
  /** Tabelas que não puderam ser lidas inteiras. Vazio = dados completos. */
  incompletas: string[];
}> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, target_glucose_min, target_glucose_max")
    .eq("id", userId)
    .maybeSingle();

  const p = (profile ?? null) as ProfileTargets | null;
  const timezone = p?.timezone ?? null;
  const { targetMin, targetMax } = resolveGlucoseTargets(p);

  // Janela alinhada ao dia LOCAL do usuário, não ao instante exato — senão
  // leituras feitas de madrugada (fuso local) no primeiro dia da janela
  // ficam de fora da query mesmo aparecendo dentro do período exibido
  // (mesma classe de bug de fuso já corrigida em outras telas; ver
  // lib/time/local-day.ts).
  const periodEnd = localDateKey(new Date().toISOString(), timezone);
  const [endYear, endMonth, endDay] = periodEnd.split("-").map(Number);
  const startCalendarDate = new Date(Date.UTC(endYear, endMonth - 1, endDay - windowDays));
  const dayStart = [
    startCalendarDate.getUTCFullYear(),
    String(startCalendarDate.getUTCMonth() + 1).padStart(2, "0"),
    String(startCalendarDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const { startISO: sinceIso } = localDayRangeUTC(dayStart, timezone);

  // Glicemia, água e doses podem passar de 1000 linhas na janela (14 dias de
  // CGM são ~2.700 leituras). Sem paginar, o PostgREST devolvia as mil mais
  // ANTIGAS em silêncio, e o score gravado cobria ~5 dias de 14.
  const [gPag, wPag, medPag] = await Promise.all([
    fetchAllRowsDetalhado<{ value_mg_dl: number; recorded_at: string }>(
      supabase, "glucose_readings", "value_mg_dl, recorded_at", userId,
      { orderColumn: "recorded_at", since: sinceIso }
    ),
    fetchAllRowsDetalhado<{ amount_ml: number | null; kind: string | null; logged_at: string }>(
      supabase, "water_logs", "amount_ml, kind, logged_at", userId,
      { orderColumn: "logged_at", since: sinceIso }
    ),
    fetchAllRowsDetalhado<{ taken_at: string; confirmed: boolean | null }>(
      supabase, "medication_logs", "taken_at, confirmed", userId,
      { orderColumn: "taken_at", since: sinceIso }
    ),
  ]);
  const incompletas = [
    gPag.completo ? null : "glucose_readings",
    wPag.completo ? null : "water_logs",
    medPag.completo ? null : "medication_logs",
  ].filter((t): t is string => t !== null);

  const [mRes, eRes, hRes, insRes, weightRes, examRes] = await Promise.all([
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
      .or(FILTRO_SEM_DEMONSTRACAO)
      .gte("snapshot_date", dayStart),
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

  const glucose = gPag.rows.map((r) => ({
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
  for (const w of wPag.rows) {
    const kind = (w.kind as string | null) ?? "agua";
    if (kind !== "agua" && kind !== "agua_com_gas" && kind !== "cha") continue;
    const day = localDateKey(w.logged_at as string, timezone);
    waterByDay.set(day, (waterByDay.get(day) ?? 0) + Number(w.amount_ml ?? 0));
  }
  const waterDays = [...waterByDay.entries()].map(([day, ml]) => ({ day, ml }));

  // "Pulei hoje" não é dose tomada (D16).
  const medLogs = medPag.rows.filter((r) => r.confirmed !== false).map((r) => ({
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
    incompletas,
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
