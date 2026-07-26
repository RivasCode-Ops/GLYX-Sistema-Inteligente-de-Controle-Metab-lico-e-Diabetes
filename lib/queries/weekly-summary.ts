/**
 * Carrega duas semanas consecutivas para o resumo semanal.
 *
 * `loadAuditDayGrid` não serve aqui: ele carrega uma janela que sempre termina
 * **agora** e é aberta em cima (só `gte`). O resumo precisa de uma janela
 * fechada, porque a semana anterior tem começo E fim.
 *
 * As duas janelas são alinhadas ao dia LOCAL do perfil, não ao instante — uma
 * leitura de 23h50 de domingo pertence ao domingo do usuário, não à segunda em
 * UTC. Mesma classe de bug de fuso já corrigida em outras telas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { computeAuditMetrics, type AuditRawInputs } from "@/lib/audit/metrics";
import { buildWeeklySummary, type WeeklySummary } from "@/lib/audit/weekly-summary";
import { resolveGlucoseTargets } from "@/lib/health/glucose-thresholds";
import { localDateKey, localDayRangeUTC } from "@/lib/time/local-day";

export const WEEK_DAYS = 7;

/** Soma dias a uma data local YYYY-MM-DD sem passar por fuso. */
function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadWindow(
  supabase: SupabaseClient,
  userId: string,
  timezone: string | null,
  targets: { targetMin: number; targetMax: number },
  startDay: string,
  endDay: string
): Promise<AuditRawInputs> {
  const { startISO } = localDayRangeUTC(startDay, timezone);
  const { endISO } = localDayRangeUTC(endDay, timezone);

  const [gRes, mRes, eRes, wRes, medRes, sleepRes] = await Promise.all([
    supabase
      .from("glucose_readings")
      .select("value_mg_dl, recorded_at")
      .eq("user_id", userId)
      .gte("recorded_at", startISO)
      .lt("recorded_at", endISO),
    supabase
      .from("meals")
      .select("carbs_g, glucose_spike, eaten_at")
      .eq("user_id", userId)
      .gte("eaten_at", startISO)
      .lt("eaten_at", endISO),
    supabase
      .from("exercise_sessions")
      .select("duration_min, started_at")
      .eq("user_id", userId)
      .gte("started_at", startISO)
      .lt("started_at", endISO),
    supabase
      .from("water_logs")
      .select("amount_ml, logged_at")
      .eq("user_id", userId)
      .gte("logged_at", startISO)
      .lt("logged_at", endISO),
    supabase
      .from("medication_logs")
      .select("taken_at")
      .eq("user_id", userId)
      .gte("taken_at", startISO)
      .lt("taken_at", endISO),
    supabase
      .from("health_snapshots")
      .select("snapshot_date, sleep_hours")
      .eq("user_id", userId)
      .gte("snapshot_date", startDay)
      .lte("snapshot_date", endDay)
      .not("sleep_hours", "is", null),
  ]);

  const waterByDay = new Map<string, number>();
  for (const w of wRes.data ?? []) {
    const day = localDateKey(w.logged_at as string, timezone);
    waterByDay.set(day, (waterByDay.get(day) ?? 0) + Number(w.amount_ml ?? 0));
  }

  return {
    windowDays: WEEK_DAYS,
    targetMin: targets.targetMin,
    targetMax: targets.targetMax,
    glucose: (gRes.data ?? []).map((r) => ({
      value_mg_dl: Number(r.value_mg_dl),
      recorded_at: r.recorded_at as string,
      day: localDateKey(r.recorded_at as string, timezone),
    })),
    meals: (mRes.data ?? []).map((r) => ({
      carbs_g: r.carbs_g != null ? Number(r.carbs_g) : null,
      glucose_spike: (r.glucose_spike as boolean | null) ?? null,
      eaten_at: r.eaten_at as string,
      day: localDateKey(r.eaten_at as string, timezone),
    })),
    exercises: (eRes.data ?? []).map((r) => ({
      duration_min: r.duration_min != null ? Number(r.duration_min) : null,
      started_at: r.started_at as string,
      day: localDateKey(r.started_at as string, timezone),
    })),
    sleepDays: (sleepRes.data ?? []).map((r) => ({
      day: r.snapshot_date as string,
      hours: r.sleep_hours != null ? Number(r.sleep_hours) : null,
    })),
    waterDays: [...waterByDay.entries()].map(([day, ml]) => ({ day, ml })),
    medLogs: (medRes.data ?? []).map((r) => ({
      taken_at: r.taken_at as string,
      day: localDateKey(r.taken_at as string, timezone),
    })),
    // Insulina, peso e exames não entram no resumo semanal: são séries de ritmo
    // mensal, e as métricas derivadas delas não são exibidas nesta tela.
    insulin: [],
    weights: [],
    examAlteredCount: 0,
  };
}

export async function loadWeeklySummary(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<WeeklySummary> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, target_glucose_min, target_glucose_max")
    .eq("id", userId)
    .maybeSingle();

  const timezone = (profile?.timezone as string | null) ?? null;
  const targets = resolveGlucoseTargets(profile);

  const endDay = localDateKey(now.toISOString(), timezone);
  const startDay = addDays(endDay, -(WEEK_DAYS - 1));
  const previousEndDay = addDays(startDay, -1);
  const previousStartDay = addDays(previousEndDay, -(WEEK_DAYS - 1));

  const [current, previous] = await Promise.all([
    loadWindow(supabase, userId, timezone, targets, startDay, endDay),
    loadWindow(supabase, userId, timezone, targets, previousStartDay, previousEndDay),
  ]);

  const previousMetrics = computeAuditMetrics(previous);

  return buildWeeklySummary({
    metrics: computeAuditMetrics(current),
    // Semana anterior sem leitura nenhuma é "não houve semana anterior", não
    // "semana anterior com zero" — senão a comparação mostraria uma queda
    // inventada para quem começou a usar o app há 5 dias.
    previousMetrics: previousMetrics.readingCount > 0 ? previousMetrics : null,
    periodStart: startDay,
    periodEnd: endDay,
    targetMin: targets.targetMin,
    targetMax: targets.targetMax,
  });
}

export async function getWeeklySummary(): Promise<WeeklySummary | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return loadWeeklySummary(supabase, user.id);
}
