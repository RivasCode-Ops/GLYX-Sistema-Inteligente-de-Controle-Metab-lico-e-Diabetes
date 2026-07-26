/**
 * Carrega e consolida tudo que o módulo de composição corporal precisa numa
 * leitura só.
 *
 * Existe como snapshot único porque as três telas (resumo, histórico, metas), o
 * relatório de IA e o contexto do chat consomem o MESMO conjunto derivado — se
 * cada um montasse o seu, a tela e a IA acabariam divergindo sobre o mesmo
 * corpo, que é o pior defeito possível num app de acompanhamento.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  BODY_FIELD_KEYS,
  type BodyMeasurement,
} from "@/lib/body/fields";
import { computeComposition, type BodyComposition, type Sex } from "@/lib/body/composition";
import { computeProgress, type BodyProgress } from "@/lib/body/progress";
import { computeAllGoalProgress, type BodyGoalRow, type GoalProgress } from "@/lib/body/goals";
import { buildBodyAlerts, type BodyAlert } from "@/lib/body/alerts";
import { buildDashboardBars, type DashboardBar } from "@/lib/body/dashboard";
import {
  computeProgression,
  computeWeeklyVolume,
  type ExerciseProgression,
  type GroupVolume,
  type StrengthLogRow,
} from "@/lib/exercicios/weekly-volume";
import { getWeeklyExerciseTarget, startOfWeek } from "@/lib/exercicios/weekly-goals";
import { resolveMuscleGroupIds, type MuscleGroupId } from "@/lib/data/muscle-groups";
import type { BodyGoal } from "@/lib/health/energy";

/** Janela de volume: 4 semanas suaviza semana de férias sem diluir mudança real de rotina. */
export const VOLUME_WINDOW_WEEKS = 4;
/** Janela de progressão de carga: 8 semanas é o mínimo pra distinguir ganho de oscilação. */
export const PROGRESSION_WINDOW_WEEKS = 8;

export type BodyPhotoRow = {
  id: string;
  taken_on: string;
  pose: "frente" | "costas" | "perfil_esq" | "perfil_dir";
  photo_path: string;
};

export type BodySnapshot = {
  profile: {
    sex: Sex | null;
    ageYears: number | null;
    heightCm: number | null;
    bodyGoal: BodyGoal | null;
    targetWeightKg: number | null;
  };
  /** Histórico completo em ordem cronológica (mais antiga primeiro). */
  history: BodyMeasurement[];
  latest: BodyMeasurement | null;
  previous: BodyMeasurement | null;
  latestComposition: BodyComposition | null;
  previousComposition: BodyComposition | null;
  /** Composição de cada medição, para os gráficos de massa magra/gordura. */
  compositionSeries: { date: string; composition: BodyComposition }[];
  progress: BodyProgress | null;
  goals: GoalProgress[];
  rawGoals: BodyGoalRow[];
  volume: GroupVolume[];
  progressions: ExerciseProgression[];
  bars: DashboardBar[];
  alerts: BodyAlert[];
  photos: BodyPhotoRow[];
  weekly: { minutes: number; targetMinutes: number };
  glucoseLoweringMeds: boolean;
};

/** Nomes que indicam medicação capaz de causar hipoglicemia — muda o texto de
 * qualquer sugestão que envolva comer menos. Lista de prefixos, não igualdade:
 * o nome comercial vem digitado pelo usuário. */
const HYPO_RISK_PATTERNS = [
  "insulin",
  "glicazida",
  "gliclazida",
  "glibenclamida",
  "glimepirida",
  "glipizida",
  "clorpropamida",
  "repaglinida",
  "nateglinida",
];

export function usesGlucoseLoweringMeds(names: string[]): boolean {
  return names.some((raw) => {
    const name = raw.toLowerCase();
    return HYPO_RISK_PATTERNS.some((p) => name.includes(p));
  });
}

function toMeasurement(row: Record<string, unknown>): BodyMeasurement {
  const out: BodyMeasurement = { measured_on: String(row.measured_on) };
  for (const key of BODY_FIELD_KEYS) {
    const raw = row[key];
    if (raw == null) continue;
    const num = Number(raw);
    if (Number.isFinite(num)) out[key] = num;
  }
  return out;
}

export async function loadBodySnapshot(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<BodySnapshot> {
  const [profileRes, measurementsRes, goalsRes, photosRes, weightRes, strengthRes, sessionsRes, medsRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("sex, birth_year, height_cm, body_goal, target_weight_kg")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", userId)
        .order("measured_on", { ascending: true })
        .limit(200),
      supabase
        .from("body_goals")
        .select("metric, target_value, start_value, start_on, target_date")
        .eq("user_id", userId),
      supabase
        .from("body_photos")
        .select("id, taken_on, pose, photo_path")
        .eq("user_id", userId)
        .order("taken_on", { ascending: false })
        .limit(60),
      supabase
        .from("weight_logs")
        .select("weight_kg, logged_on")
        .eq("user_id", userId)
        .order("logged_on", { ascending: false })
        .limit(1),
      supabase
        .from("strength_logs")
        .select("exercise_name, muscle_group, weight_kg, reps, sets, logged_at")
        .eq("user_id", userId)
        .gte(
          "logged_at",
          new Date(now.getTime() - PROGRESSION_WINDOW_WEEKS * 7 * 86_400_000).toISOString()
        )
        .order("logged_at", { ascending: false })
        .limit(500),
      supabase
        .from("exercise_sessions")
        .select("muscle_groups, started_at, duration_min")
        .eq("user_id", userId)
        .gte("started_at", new Date(now.getTime() - 30 * 86_400_000).toISOString())
        .order("started_at", { ascending: false })
        .limit(200),
      supabase.from("medications").select("name").eq("user_id", userId).eq("active", true),
    ]);

  const profileRow = profileRes.data as
    | {
        sex: Sex | null;
        birth_year: number | null;
        height_cm: number | null;
        body_goal: BodyGoal | null;
        target_weight_kg: number | null;
      }
    | null;

  const ageYears = profileRow?.birth_year ? now.getFullYear() - profileRow.birth_year : null;
  const profile = {
    sex: profileRow?.sex ?? null,
    ageYears,
    heightCm: profileRow?.height_cm ?? null,
    bodyGoal: profileRow?.body_goal ?? null,
    targetWeightKg: profileRow?.target_weight_kg ?? null,
  };

  const history = ((measurementsRes.data ?? []) as Record<string, unknown>[]).map(toMeasurement);
  const latest = history.length ? history[history.length - 1] : null;
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const fallbackWeightKg = weightRes.data?.[0]?.weight_kg
    ? Number(weightRes.data[0].weight_kg)
    : null;

  const compositionFor = (m: BodyMeasurement, isLatest: boolean): BodyComposition =>
    computeComposition({
      measurement: m,
      sex: profile.sex,
      ageYears: profile.ageYears,
      heightCm: profile.heightCm,
      // O peso de weight_logs só substitui o da medição mais recente: aplicar o
      // peso de hoje a uma medida de três meses atrás inventaria evolução.
      fallbackWeightKg: isLatest ? fallbackWeightKg : null,
    });

  const compositionSeries = history.map((m, i) => ({
    date: m.measured_on,
    composition: compositionFor(m, i === history.length - 1),
  }));

  const latestComposition = compositionSeries.length
    ? compositionSeries[compositionSeries.length - 1].composition
    : null;
  const previousComposition =
    compositionSeries.length > 1 ? compositionSeries[compositionSeries.length - 2].composition : null;

  const progress =
    latest && previous && latestComposition && previousComposition
      ? computeProgress(
          { measurement: previous, composition: previousComposition },
          { measurement: latest, composition: latestComposition }
        )
      : null;

  const rawGoals = (goalsRes.data ?? []) as BodyGoalRow[];
  const goals = computeAllGoalProgress(rawGoals, history);

  const strengthLogs = ((strengthRes.data ?? []) as StrengthLogRow[]).map((l) => ({
    ...l,
    weight_kg: l.weight_kg != null ? Number(l.weight_kg) : null,
  }));
  const volume = computeWeeklyVolume(strengthLogs, VOLUME_WINDOW_WEEKS, now);
  const progressions = computeProgression(strengthLogs, PROGRESSION_WINDOW_WEEKS, now);

  const sessions = (sessionsRes.data ?? []) as {
    muscle_groups: string[] | null;
    started_at: string;
    duration_min: number | null;
  }[];

  const lastTrainedByGroup: Partial<Record<MuscleGroupId, string>> = {};
  for (const s of sessions) {
    for (const g of s.muscle_groups ?? []) {
      for (const id of resolveMuscleGroupIds(g)) {
        if (!lastTrainedByGroup[id]) lastTrainedByGroup[id] = s.started_at;
      }
    }
  }

  const weekStart = startOfWeek(now);
  const weeklyMinutes = sessions
    .filter((s) => new Date(s.started_at) >= weekStart)
    .reduce((sum, s) => sum + (s.duration_min ?? 0), 0);
  const weeklyTargetMinutes = getWeeklyExerciseTarget(profile.bodyGoal).targetMinutes;

  const glucoseLoweringMeds = usesGlucoseLoweringMeds(
    ((medsRes.data ?? []) as { name: string }[]).map((m) => m.name)
  );

  const bars = buildDashboardBars({
    goals,
    progressions,
    lastTrainedByGroup,
    weeklyMinutes,
    weeklyTargetMinutes,
    now,
  });

  const alerts = buildBodyAlerts({
    progress,
    goals,
    volume,
    history,
    latestComposition,
    latestMeasurement: latest,
    glucoseLoweringMeds,
    now,
  });

  return {
    profile,
    history,
    latest,
    previous,
    latestComposition,
    previousComposition,
    compositionSeries,
    progress,
    goals,
    rawGoals,
    volume,
    progressions,
    bars,
    alerts,
    photos: (photosRes.data ?? []) as BodyPhotoRow[],
    weekly: { minutes: weeklyMinutes, targetMinutes: weeklyTargetMinutes },
    glucoseLoweringMeds,
  };
}

/** Versão para páginas: resolve cliente e usuário da sessão. */
export async function getBodySnapshot(): Promise<BodySnapshot | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return loadBodySnapshot(supabase, user.id);
}
