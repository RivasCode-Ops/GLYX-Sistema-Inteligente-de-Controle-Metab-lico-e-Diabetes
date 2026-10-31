import { createClient } from "@/lib/supabase/server";
import type { HealthSnapshotSource } from "@/lib/health/types";
import { FILTRO_SEM_DEMONSTRACAO } from "@/lib/queries/fetch-all";
import { localDateKey } from "@/lib/time/local-day";

// Sem "mock": demonstração não é dado do usuário (B12).
const PRIORITY: HealthSnapshotSource[] = ["manual", "apple_health", "google_fit"];

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

  // "Hoje" no fuso do perfil (B7): pela data UTC, depois das 21h em São Paulo
  // a tela procurava o snapshot de amanhã e mostrava vazio.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const today = localDateKey(
    new Date().toISOString(),
    (perfil as { timezone?: string | null } | null)?.timezone
  );

  const { data, error } = await supabase
    .from("health_snapshots")
    .select("source, steps, sleep_hours, resting_hr")
    .eq("user_id", user.id)
    .or(FILTRO_SEM_DEMONSTRACAO)
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
