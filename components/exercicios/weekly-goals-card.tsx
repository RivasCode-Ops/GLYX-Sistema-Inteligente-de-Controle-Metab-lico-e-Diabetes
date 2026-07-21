import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeWeeklyExerciseProgress, getWeeklyExerciseTarget } from "@/lib/exercicios/weekly-goals";
import type { WeeklyExerciseGlucoseContext } from "@/lib/exercicios/weekly-goals";
import type { ExerciseSession } from "@/types/database";
import type { BodyGoal } from "@/lib/health/energy";

function statusTone(status: "on-track" | "behind" | "ahead") {
  switch (status) {
    case "ahead":
      return "text-emerald-300";
    case "on-track":
      return "text-amber-300";
    default:
      return "text-zinc-400";
  }
}

type Props = {
  sessions: ExerciseSession[];
  goal: BodyGoal | null;
  glucose?: WeeklyExerciseGlucoseContext;
};

export function WeeklyGoalsCard({ sessions, goal, glucose }: Props) {
  const target = getWeeklyExerciseTarget(goal);
  const progress = computeWeeklyExerciseProgress(sessions, new Date(), goal, glucose);
  const progressValue = progress.progressPct;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Meta semanal de exercício</CardTitle>
        <CardDescription>
          {target.weeklyFocus} · alvo de {target.targetMinutes} min e {target.targetSessions} sessões.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-semibold text-zinc-100">{progress.minutes} min</p>
            <p className="text-sm text-zinc-500">{progress.activeDays} dias ativos · {progress.sessions} sessões</p>
          </div>
          <p className={`text-sm font-medium ${statusTone(progress.status)}`}>{progress.message}</p>
        </div>

        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-400">
          {progress.recommendation}
        </p>

        <div className="rounded-lg border border-emerald-700/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          <p className="font-medium">Sugestão de treino</p>
          <p className="mt-1 text-emerald-100/90">{progress.workoutSuggestion}</p>
        </div>

        {progress.status !== "ahead" ? (
          <div className="rounded-lg border border-amber-700/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Lembrete: hoje é um bom dia para fazer uma sessão curta e manter a consistência da semana.
          </div>
        ) : null}

        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progressValue}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>0%</span>
          <span>{progressValue}%</span>
          <span>100%</span>
        </div>
      </CardContent>
    </Card>
  );
}
