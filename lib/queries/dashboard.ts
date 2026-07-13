import { createClient } from "@/lib/supabase/server";
import { getTodayHealthBest } from "@/lib/queries/health-today";
import { startOfLocalDayISO } from "@/lib/time/local-day";
import type { MetabolicAlert } from "@/types/database";

export type DashboardSummary = {
  latestGlucose: number | null;
  carbsToday: number;
  activeMinutes: number;
  alerts: MetabolicAlert[];
  riskLabel: string;
  stepsToday: number | null;
  sleepHoursToday: number | null;
};

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const startOfDayISO = startOfLocalDayISO(profile?.timezone);

  const [glucoseRes, mealsRes, exercisesRes, alertsRes] = await Promise.all([
    supabase
      .from("glucose_readings")
      .select("value_mg_dl")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meals")
      .select("carbs_g")
      .eq("user_id", user.id)
      .gte("eaten_at", startOfDayISO),
    supabase
      .from("exercise_sessions")
      .select("duration_min")
      .eq("user_id", user.id)
      .gte("started_at", startOfDayISO),
    supabase
      .from("metabolic_alerts")
      .select("*")
      .eq("user_id", user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const latestGlucose = glucoseRes.data?.value_mg_dl ?? null;
  const carbsSum =
    mealsRes.data?.reduce(
      (acc: number, m: { carbs_g: number | null }) =>
        acc + (m.carbs_g != null ? Number(m.carbs_g) : 0),
      0
    ) ?? 0;
  const activeMin =
    exercisesRes.data?.reduce(
      (acc: number, e: { duration_min: number | null }) => acc + (e.duration_min ?? 0),
      0
    ) ?? 0;

  let riskLabel = "—";
  if (latestGlucose != null) {
    if (latestGlucose >= 180 || latestGlucose < 70) riskLabel = "Atenção";
    else if (latestGlucose >= 140) riskLabel = "Moderado";
    else riskLabel = "Baixo";
  }

  let stepsToday: number | null = null;
  let sleepHoursToday: number | null = null;
  try {
    const health = await getTodayHealthBest();
    if (health) {
      stepsToday = health.steps;
      sleepHoursToday = health.sleepHours;
    }
  } catch {
    /* migração health_snapshots opcional */
  }

  return {
    latestGlucose,
    carbsToday: Math.round(carbsSum * 10) / 10,
    activeMinutes: activeMin,
    alerts: (alertsRes.data ?? []) as MetabolicAlert[],
    riskLabel,
    stepsToday,
    sleepHoursToday,
  };
}
