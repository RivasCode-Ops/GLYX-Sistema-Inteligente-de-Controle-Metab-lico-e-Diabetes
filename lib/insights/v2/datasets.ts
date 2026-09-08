import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateGlucoseByDay, type GlucosePoint } from "@/lib/queries/glucose-series";
import type { HealthSnapshotSource } from "@/lib/health/types";
import { fetchAllRows } from "@/lib/queries/fetch-all";

const SRC: HealthSnapshotSource[] = ["manual", "apple_health", "google_fit", "mock"];

export type DaySleep = { day: string; hours: number | null };
export type DayCarbs = { day: string; grams: number };
export type DayExercise = { day: string; minutes: number };
export type DayGlucose = { day: string; avg: number; count: number };

/**
 * Dados alinhados por dia para o motor v2.
 */
export async function loadInsightDatasets(
  supabase: SupabaseClient,
  userId: string,
  days: number
): Promise<{
  byDayGlucose: Map<string, DayGlucose>;
  byDaySleep: Map<string, number | null>;
  byDayCarbs: Map<string, number>;
  byDayExercise: Map<string, number>;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();
  const dayStart = since.toISOString().slice(0, 10);

  const [gRes, mRes, eRes, hRes] = await Promise.all([
    // Paginado pelo mesmo motivo do histórico: o teto de 1000 do PostgREST
    // devolvia só o começo da janela, e os insights liam um recorte antigo
    // achando que liam tudo.
    fetchAllRows<GlucosePoint>(supabase, "glucose_readings", "id, value_mg_dl, recorded_at", userId, {
      orderColumn: "recorded_at",
      since: sinceIso,
    }),
    supabase
      .from("meals")
      .select("carbs_g, eaten_at")
      .eq("user_id", userId)
      .gte("eaten_at", sinceIso),
    supabase
      .from("exercise_sessions")
      .select("duration_min, started_at")
      .eq("user_id", userId)
      .gte("started_at", sinceIso),
    supabase
      .from("health_snapshots")
      .select("snapshot_date, source, sleep_hours, steps")
      .eq("user_id", userId)
      .gte("snapshot_date", dayStart),
  ]);

  const gPoints = gRes;
  const aggs = aggregateGlucoseByDay(gPoints);
  const byDayGlucose = new Map<string, DayGlucose>();
  for (const a of aggs) {
    byDayGlucose.set(a.day, { day: a.day, avg: a.avg, count: a.count });
  }

  const byDaySleep = new Map<string, number | null>();
  const sleepRows = hRes.error ? [] : (hRes.data ?? []);
  const byDateSources = new Map<string, typeof sleepRows>();
  for (const row of sleepRows) {
    const d = row.snapshot_date as string;
    if (!byDateSources.has(d)) byDateSources.set(d, []);
    byDateSources.get(d)!.push(row);
  }
  for (const [d, rows] of byDateSources) {
    let hours: number | null = null;
    for (const src of SRC) {
      const r = rows.find((x) => x.source === src);
      if (r?.sleep_hours != null) {
        hours = Number(r.sleep_hours);
        break;
      }
    }
    byDaySleep.set(d, hours);
  }

  const byDayCarbs = new Map<string, number>();
  for (const m of mRes.data ?? []) {
    const day = (m.eaten_at as string).slice(0, 10);
    const g = m.carbs_g != null ? Number(m.carbs_g) : 0;
    byDayCarbs.set(day, (byDayCarbs.get(day) ?? 0) + g);
  }

  const byDayExercise = new Map<string, number>();
  for (const x of eRes.data ?? []) {
    const day = (x.started_at as string).slice(0, 10);
    const min = x.duration_min ?? 0;
    byDayExercise.set(day, (byDayExercise.get(day) ?? 0) + min);
  }

  return { byDayGlucose, byDaySleep, byDayCarbs, byDayExercise };
}
