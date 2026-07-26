import Link from "next/link";
import { GoalTrainingCard } from "@/components/exercicios/goal-training-card";
import { TrainingPlanCard } from "@/components/exercicios/training-plan-card";
import { SessionPrescriptionCard } from "@/components/exercicios/session-prescription-card";
import { computeMuscleRecovery } from "@/lib/exercicios/muscle-recovery";
import type { MuscleRecoveryStatus } from "@/lib/exercicios/muscle-recovery";
import { suggestFromPlan } from "@/lib/exercicios/training-plan";
import {
  prescribeForSession,
  uncoveredGoalMuscles,
  type GroupPrescription,
} from "@/lib/exercicios/plan-prescription";
import type { ExerciseProgression } from "@/lib/exercicios/weekly-volume";
import { loadBodySnapshot } from "@/lib/queries/body-composition";
import { getActiveMusclePauses, getLastTrainedByMuscleGroup } from "@/lib/queries/muscle-recovery";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { BodyGoal } from "@/lib/health/energy";

export default async function ExerciciosPlanoPage() {
  const demoMode = !isSupabaseConfigured();
  let bodyGoal: BodyGoal | null = null;
  let statuses: MuscleRecoveryStatus[] = [];
  let prescriptions: GroupPrescription[] = [];
  let progressions: ExerciseProgression[] = [];
  let uncovered: ReturnType<typeof uncoveredGoalMuscles> = [];

  if (!demoMode) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const [{ data }, lastTrained, pausedGroups, snapshot] = await Promise.all([
          supabase.from("profiles").select("body_goal").eq("id", user.id).maybeSingle(),
          getLastTrainedByMuscleGroup(),
          getActiveMusclePauses(),
          // Mesmo snapshot que o módulo de composição usa: se o plano montasse o
          // próprio cálculo de volume, as duas telas acabariam discordando sobre
          // quantas séries de costas o usuário fez na semana.
          loadBodySnapshot(supabase, user.id),
        ]);
        bodyGoal = (data?.body_goal as typeof bodyGoal) ?? null;
        statuses = computeMuscleRecovery(lastTrained, pausedGroups);
        progressions = snapshot.progressions;
        uncovered = uncoveredGoalMuscles(snapshot.volume, snapshot.goals);

        // A prescrição só cobre o que a recuperação já liberou para hoje —
        // nunca ressuscita um grupo que o plano vetou por não ter descansado.
        const suggestion = suggestFromPlan(statuses);
        prescriptions = prescribeForSession(
          suggestion.included.map((s) => ({ id: s.id, label: s.label })),
          snapshot.volume,
          snapshot.goals
        );
      }
    }
  } else {
    statuses = computeMuscleRecovery({}, {});
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="text-sm text-zinc-400">
        O plano semanal é derivado do seu objetivo corporal, com diretrizes ADA de segurança
        glicêmica por tipo de treino.
      </p>
      {demoMode ? (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          Demo pública: exemplo com objetivo &ldquo;manter&rdquo;. Configure o Supabase para ver o
          plano personalizado ao seu objetivo real.
        </p>
      ) : null}
      <TrainingPlanCard statuses={statuses} />
      {!demoMode ? (
        <SessionPrescriptionCard
          prescriptions={prescriptions}
          progressions={progressions}
          uncovered={uncovered}
        />
      ) : null}
      <GoalTrainingCard goal={demoMode ? "maintain" : bodyGoal} />
      {!demoMode ? (
        <p className="text-xs text-zinc-500">
          Quer mudar o foco (emagrecer, ganhar massa, manter)?{" "}
          <Link href="/perfil" className="text-emerald-400 underline">
            Ajuste no Perfil
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
