import { createClient } from "@/lib/supabase/server";
import { glucoseTrend, readingAge, type Freshness } from "@/lib/health/reading-freshness";
import { resolveGlucoseTargets } from "@/lib/health/glucose-thresholds";
import { getTodayHealthBest } from "@/lib/queries/health-today";
import { startOfLocalDayISO } from "@/lib/time/local-day";
import type { MetabolicAlert } from "@/types/database";

export type DashboardSummary = {
  latestGlucose: number | null;
  /** Quando a última leitura foi medida, e há quanto tempo isso foi. */
  latestGlucoseAt: string | null;
  latestGlucoseAgeLabel: string | null;
  latestGlucoseFreshness: Freshness | null;
  /** Direção medida entre as duas últimas leituras, ou null quando não dá para afirmar. */
  glucoseTrend: "up" | "down" | "flat" | null;
  /** Últimas leituras (ordem cronológica), para o sparkline do card de glicemia. */
  glucoseSeries: number[];
  carbsToday: number;
  activeMinutes: number;
  alerts: MetabolicAlert[];
  riskLabel: string;
  /**
   * A faixa alvo por extenso, ex. "70–140".
   *
   * `riskLabel` sozinho diz "Moderado" sem dizer moderado em relação a quê — e
   * a faixa é configurada com o médico, então ela varia de pessoa para pessoa.
   * Rótulo de risco sem a régua ao lado é adjetivo, não medida.
   */
  targetRangeLabel: string;
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
    .select("timezone, target_glucose_min, target_glucose_max")
    .eq("id", user.id)
    .maybeSingle();
  const startOfDayISO = startOfLocalDayISO(profile?.timezone);
  const { targetMin, targetMax } = resolveGlucoseTargets(profile);

  const [glucoseRes, mealsRes, exercisesRes, alertsRes] = await Promise.all([
    supabase
      .from("glucose_readings")
      // `recorded_at` entra aqui porque sem ele nenhuma tela consegue saber a
      // idade do dado — era essa a raiz de o painel anunciar "Glicemia atual"
      // com leitura de três semanas.
      .select("value_mg_dl, recorded_at")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(8),
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

  const recentGlucose = (glucoseRes.data ?? []) as {
    value_mg_dl: number;
    recorded_at: string;
  }[];
  const latestGlucose = recentGlucose[0]?.value_mg_dl ?? null;
  const latestGlucoseAt = recentGlucose[0]?.recorded_at ?? null;
  const idade = latestGlucoseAt ? readingAge(latestGlucoseAt) : null;
  // Ordem cronológica: o banco devolve do mais novo para o mais velho.
  const cronologico = [...recentGlucose].reverse();
  const glucoseSeries = cronologico.map((r) => r.value_mg_dl);
  const trend = glucoseTrend(
    cronologico.map((r) => ({ value: r.value_mg_dl, recordedAt: r.recorded_at }))
  );
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

  // Faixa alvo do perfil (definida com o médico); 70–180 é só o padrão inicial.
  //
  // Leitura velha NÃO vira classificação de risco. Dizer "Baixo" a partir de um
  // número de três semanas atrás é afirmar sobre o presente com dado do
  // passado — e é a afirmação que mais pesa na tela, porque some com a dúvida
  // de quem vai decidir dose.
  let riskLabel = "—";
  if (latestGlucose != null && idade?.freshness !== "stale") {
    const moderateFrom = Math.round(targetMin + (targetMax - targetMin) * 0.65);
    if (latestGlucose >= targetMax || latestGlucose < targetMin) riskLabel = "Atenção";
    else if (latestGlucose >= moderateFrom) riskLabel = "Moderado";
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
    latestGlucoseAt,
    latestGlucoseAgeLabel: idade?.label ?? null,
    latestGlucoseFreshness: idade?.freshness ?? null,
    glucoseTrend: idade?.freshness === "stale" ? null : trend,
    glucoseSeries,
    carbsToday: Math.round(carbsSum * 10) / 10,
    activeMinutes: activeMin,
    alerts: (alertsRes.data ?? []) as MetabolicAlert[],
    riskLabel,
    targetRangeLabel: `${targetMin}–${targetMax}`,
    stepsToday,
    sleepHoursToday,
  };
}
