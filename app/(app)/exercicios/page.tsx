import { SectionCards } from "@/components/module/section-cards";
import { GoalTrainingCard } from "@/components/exercicios/goal-training-card";
import { NewSessionForm } from "@/components/exercicios/new-session-form";
import { WeeklyGoalsCard } from "@/components/exercicios/weekly-goals-card";
import { startOfWeek } from "@/lib/exercicios/weekly-goals";
import type { WeeklyExerciseGlucoseContext } from "@/lib/exercicios/weekly-goals";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import type { ExerciseSession } from "@/types/database";
import type { BodyGoal } from "@/lib/health/energy";
import { demoExercises } from "@/lib/demo/data";

export default async function ExerciciosOverviewPage() {
  let sessions: ExerciseSession[] = [];
  let weekSessions: ExerciseSession[] = [];
  let bodyGoal: BodyGoal | null = null;
  let glucose: WeeklyExerciseGlucoseContext | undefined;
  const demoMode = !isSupabaseConfigured();

  if (demoMode) {
    sessions = demoExercises;
    weekSessions = demoExercises;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const weekStart = startOfWeek(new Date()).toISOString();
        const [{ data }, { data: week }, { data: p }, { data: lastGlucose }] = await Promise.all([
          supabase
            .from("exercise_sessions")
            .select("*")
            .eq("user_id", user.id)
            .order("started_at", { ascending: false })
            .limit(8),
          supabase
            .from("exercise_sessions")
            .select("*")
            .eq("user_id", user.id)
            .gte("started_at", weekStart)
            .order("started_at", { ascending: false }),
          supabase
            .from("profiles")
            .select("body_goal, target_glucose_min, target_glucose_max")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("glucose_readings")
            .select("value_mg_dl")
            .eq("user_id", user.id)
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        sessions = (data ?? []) as ExerciseSession[];
        weekSessions = (week ?? []) as ExerciseSession[];
        bodyGoal = (p?.body_goal as typeof bodyGoal) ?? null;
        glucose = {
          latestGlucose: lastGlucose?.value_mg_dl ?? null,
          targetMin: p?.target_glucose_min ?? 70,
          targetMax: p?.target_glucose_max ?? 180,
        };
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <p className="text-sm text-zinc-400">
        Treino e metabolismo — cada subárea tem página própria.
      </p>
      {!demoMode ? <GoalTrainingCard goal={bodyGoal} /> : null}
      <WeeklyGoalsCard sessions={weekSessions} goal={bodyGoal} glucose={glucose} />
      <SectionCards
        items={[
          {
            title: "Plano de treino",
            description: "Periodização e foco em segurança glicêmica.",
            href: "/exercicios/plano",
          },
          {
            title: "Sessões",
            description: "Histórico e drill-down por sessão.",
            href: "/exercicios/sessoes",
          },
          {
            title: "Recuperação muscular",
            description: "O que já pode treinar de novo e o que ainda está descansando.",
            href: "/exercicios/recuperacao",
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar sessão</CardTitle>
          <CardDescription>Atividade recente alimenta o painel e insights.</CardDescription>
        </CardHeader>
        <CardContent>
          {demoMode ? (
            <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              Demo pública: sessões fictícias mostram o fluxo de registro e correlação com glicemia.
            </p>
          ) : null}
          <NewSessionForm />
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-100">Recentes</h2>
          <Link href="/exercicios/sessoes" className="text-xs text-emerald-400 hover:underline">
            Ver todas →
          </Link>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma sessão registrada.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/exercicios/sessoes/${s.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-800/40"
                >
                  <span className="text-zinc-200">{s.label}</span>
                  <span className="font-mono text-xs text-zinc-500">
                    {s.duration_min != null ? `${s.duration_min} min` : "—"} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
