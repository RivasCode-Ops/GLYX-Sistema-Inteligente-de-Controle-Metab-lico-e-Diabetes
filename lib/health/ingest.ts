import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnifiedHealthSnapshot } from "@/lib/health/types";

export type HealthIngestResult = { upserted: number; error?: string };

export async function ingestHealthSnapshots(
  supabase: SupabaseClient,
  userId: string,
  snapshots: UnifiedHealthSnapshot[]
): Promise<HealthIngestResult> {
  if (snapshots.length === 0) return { upserted: 0 };

  const rows = snapshots.map((s) => ({
    user_id: userId,
    snapshot_date: s.snapshotDate,
    source: s.source,
    steps: s.steps,
    sleep_hours: s.sleepHours,
    resting_hr: s.restingHr,
    active_calories: s.activeCalories,
    stress_score: s.stressScore,
    metadata: s.metadata,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("health_snapshots").upsert(rows, {
    onConflict: "user_id,snapshot_date,source",
  });

  if (error) return { upserted: 0, error: error.message };
  return { upserted: rows.length };
}
