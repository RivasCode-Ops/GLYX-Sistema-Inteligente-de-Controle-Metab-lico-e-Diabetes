import type { ExerciseSession } from "@/types/database";
import type { BodyGoal } from "@/lib/health/energy";

export type WeeklyExerciseGoal = {
  targetMinutes: number;
  targetSessions: number;
  weeklyFocus: string;
};

export type WeeklyExerciseProgress = {
  minutes: number;
  activeDays: number;
  sessions: number;
  targetMinutes: number;
  targetSessions: number;
  progressPct: number;
  status: "on-track" | "behind" | "ahead";
  message: string;
  recommendation: string;
  workoutSuggestion: string;
};

export type WeeklyExerciseGlucoseContext = {
  latestGlucose: number | null;
  targetMin: number;
  targetMax: number;
};

export function getWeeklyExerciseTarget(goal: BodyGoal | null): WeeklyExerciseGoal {
  switch (goal) {
    case "lose":
      return { targetMinutes: 150, targetSessions: 3, weeklyFocus: "Emagrecimento e consistência" };
    case "gain":
      return { targetMinutes: 180, targetSessions: 4, weeklyFocus: "Força e hipertrofia" };
    case "recomp":
      return { targetMinutes: 160, targetSessions: 4, weeklyFocus: "Composição corporal" };
    case "maintain":
    default:
      return { targetMinutes: 120, targetSessions: 3, weeklyFocus: "Manter rotina e estabilidade glicêmica" };
  }
}

export function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(date: Date): Date {
  const copy = startOfWeek(date);
  copy.setDate(copy.getDate() + 6);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function computeWeeklyExerciseProgress(
  sessions: ExerciseSession[],
  now: Date = new Date(),
  goal: BodyGoal | null = null,
  glucoseContext?: WeeklyExerciseGlucoseContext
): WeeklyExerciseProgress {
  const start = startOfWeek(now);
  const end = endOfWeek(now);

  const thisWeek = sessions.filter((session) => {
    const startedAt = new Date(session.started_at);
    return startedAt >= start && startedAt <= end;
  });

  const minutes = thisWeek.reduce((sum, session) => sum + (session.duration_min ?? 0), 0);
  const activeDays = new Set(thisWeek.map((session) => session.started_at.slice(0, 10))).size;
  const sessionsCount = thisWeek.length;
  const target = getWeeklyExerciseTarget(goal);
  const progressPct = target.targetMinutes === 0 ? 0 : Math.min(100, Math.round((minutes / target.targetMinutes) * 100));

  let status: WeeklyExerciseProgress["status"] = "behind";
  if (progressPct >= 100) status = "ahead";
  else if (progressPct >= 70) status = "on-track";

  const missingMinutes = Math.max(0, target.targetMinutes - minutes);
  const missingSessions = Math.max(0, target.targetSessions - sessionsCount);

  const message =
    minutes >= target.targetMinutes
      ? "Meta semanal atingida — continue com a consistência."
      : `Faltam ${missingMinutes} min para a meta semanal.`;

  const recommendation =
    minutes >= target.targetMinutes
      ? "Continue assim e mantenha a rotina de treino desta semana."
      : missingSessions > 0
        ? `Reserve mais ${missingSessions} sessão${missingSessions > 1 ? "s" : ""} esta semana para fechar a meta.`
        : `Faça uma sessão curta hoje para fechar ${missingMinutes} min de atividade.`;

  const latestGlucose = glucoseContext?.latestGlucose ?? null;
  const targetMin = glucoseContext?.targetMin ?? 70;
  const targetMax = glucoseContext?.targetMax ?? 180;

  let workoutSuggestion =
    goal === "lose"
      ? "Sugestão: 30 min de caminhada moderada + 10 min de mobilidade."
      : goal === "gain"
        ? "Sugestão: treino de força de 40-50 min com 3-4 grupos musculares."
        : goal === "recomp"
          ? "Sugestão: treino misto de 35-45 min com força e caminhada leve."
          : "Sugestão: 25-35 min de movimento leve ou caminhada para manter a rotina.";

  if (latestGlucose != null) {
    if (latestGlucose < targetMin) {
      workoutSuggestion = "Sugestão: prefira um treino leve de 15-20 min, com hidratação e um lanche rápido se necessário.";
    } else if (latestGlucose > targetMax) {
      workoutSuggestion = "Sugestão: caminhada leve de 20-30 min com hidratação e monitoramento da glicemia após o treino.";
    }
  }

  return {
    minutes,
    activeDays,
    sessions: sessionsCount,
    targetMinutes: target.targetMinutes,
    targetSessions: target.targetSessions,
    progressPct,
    status,
    message,
    recommendation,
    workoutSuggestion,
  };
}
