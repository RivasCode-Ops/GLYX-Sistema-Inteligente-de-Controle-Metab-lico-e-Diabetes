import { createClient } from "@/lib/supabase/server";
import type { HealthSnapshotSource } from "@/lib/health/types";

const PRIORITY: HealthSnapshotSource[] = ["manual", "apple_health", "google_fit", "mock"];

export type TodayHealth = {
  steps: number | null;
  sleepHours: number | null;
  restingHr: number | null;
};

type HealthSnapshotRow = {
  source: HealthSnapshotSource;
  steps: number | null;
  sleep_hours: number | string | null;
  resting_hr: number | null;
};

export async function getTodayHealthBest(): Promise<TodayHealth | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("health_snapshots")
    .select("source, steps, sleep_hours, resting_hr")
    .eq("user_id", user.id)
    .eq("snapshot_date", today);

  if (error) return null;

  const rows = (data ?? []) as HealthSnapshotRow[];

  let steps: number | null = null;
  let sleepHours: number | null = null;
  let restingHr: number | null = null;

  for (const p of PRIORITY) {
    const r = rows.find((x) => x.source === p);
    if (r?.steps != null) {
      steps = r.steps;
      break;
    }
  }
  for (const p of PRIORITY) {
    const r = rows.find((x) => x.source === p);
    if (r?.sleep_hours != null) {
      sleepHours = Number(r.sleep_hours);
      break;
    }
  }
  for (const p of PRIORITY) {
    const r = rows.find((x) => x.source === p);
    if (r?.resting_hr != null) {
      restingHr = r.resting_hr;
      break;
    }
  }

  if (steps == null && sleepHours == null && restingHr == null) return null;

  return { steps, sleepHours, restingHr };
}
