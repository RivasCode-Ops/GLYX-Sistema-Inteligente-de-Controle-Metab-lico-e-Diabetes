import { createClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/time/local-day";

export type GlucosePoint = {
  id: string;
  value_mg_dl: number;
  recorded_at: string;
};

export async function getGlucoseReadingsSince(days: number): Promise<GlucosePoint[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data } = await supabase
    .from("glucose_readings")
    .select("id, value_mg_dl, recorded_at")
    .eq("user_id", user.id)
    .gte("recorded_at", since.toISOString())
    .order("recorded_at", { ascending: true });

  return (data ?? []) as GlucosePoint[];
}

export type DailyAgg = { day: string; avg: number; count: number; min: number; max: number };

export function aggregateGlucoseByDay(
  readings: GlucosePoint[],
  timezone?: string | null
): DailyAgg[] {
  const map = new Map<string, number[]>();
  for (const r of readings) {
    const day = localDateKey(r.recorded_at, timezone);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(r.value_mg_dl);
  }
  const rows: DailyAgg[] = [];
  for (const [day, vals] of map.entries()) {
    const sum = vals.reduce((a, b) => a + b, 0);
    rows.push({
      day,
      avg: Math.round(sum / vals.length),
      count: vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    });
  }
  rows.sort((a, b) => b.day.localeCompare(a.day));
  return rows;
}
