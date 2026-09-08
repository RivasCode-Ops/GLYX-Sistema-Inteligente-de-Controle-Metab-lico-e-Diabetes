import { SectionCards } from "@/components/module/section-cards";
import { NewSessionForm } from "@/components/exercicios/new-session-form";
import { TodayWorkoutCard } from "@/components/exercicios/today-workout-card";
import { WeekOverviewCard } from "@/components/exercicios/week-overview-card";
import { resumirSemanaDeExercicio } from "@/lib/exercicios/week-overview";
import { getTrainingDay } from "@/lib/exercicios/training-plan";
import type { WeeklyExerciseGlucoseContext } from "@/lib/exercicios/weekly-goals";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import type { ExerciseSession } from "@/types/database";
import type { BodyGoal } from "@/lib/health/energy";
import { demoExercises } from "@/lib/demo/data";
import { resolveGlucoseTargets } from "@/lib/health/glucose-thresholds";

/**
 * A janela é de 8 semanas porque a tela pergunta três coisas de horizontes
 * diferentes com UMA consulta: a semana corrente, a comparação com a anterior e
 * quantas semanas seguidas fecharam a meta. Buscar só a semana atual deixaria os
 * dois últimos números sem base — e um número sem base é pior que nenhum.
 */
const SEMANAS_DE_HISTORICO = 8;

export default async function ExerciciosOverviewPage() {
  let sessions: ExerciseSession[] = [];
  let bodyGoal: BodyGoal | null = null;
  let glucose: WeeklyExerciseGlucoseContext | undefined;
  const demoMode = !isSupabaseConfigured();

  if (demoMode) {
    sessions = demoExercises;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const desde = new Date();
        desde.setDate(desde.getDate() - 7 * SEMANAS_DE_HISTORICO);
        desde.setHours(0, 0, 0, 0);

        const [{ data }, { data: p }, { data: lastGlucose }] = await Promise.all([
          supabase
            .from("exercise_sessions")
            .select("*")
            .eq("user_id", user.id)
            .gte("started_at", desde.toISOString())
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
        bodyGoal = (p?.body_goal as typeof bodyGoal) ?? null;
        const targets = resolveGlucoseTargets(p);
        glucose = {
          latestGlucose: lastGlucose?.value_mg_dl ?? null,
          targetMin: targets.targetMin,
          targetMax: targets.targetMax,
        };
      }
    }
  }

  const agora = new Date();
  // Tudo o que a tela conta sai desta chamada — os pontos da semana, o anel, o
  // resumo rápido e os três ladrilhos. Nenhum deles reconta por fora.
  const resumo = resumirSemanaDeExercicio(sessions, bodyGoal, agora, glucose);
  const hojeISO = agora.toISOString().slice(0, 10);
  const sessoesHoje = sessions.filter((s) => s.started_at.slice(0, 10) === hojeISO).length;
  const recentes = sessions.slice(0, 8);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <TodayWorkoutCard
        day={getTrainingDay(agora)}
        sessoesHoje={sessoesHoje}
        dataLabel={agora.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "short",
        })}
      />

      <WeekOverviewCard resumo={resumo} />

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

      <Card id="registrar" className="scroll-mt-24">
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
          <Link href="/exercicios/sessoes" className="text-xs text-module-exercicio hover:underline">
            Ver todas →
          </Link>
        </div>
        {recentes.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma sessão registrada.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
            {recentes.map((s) => (
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
