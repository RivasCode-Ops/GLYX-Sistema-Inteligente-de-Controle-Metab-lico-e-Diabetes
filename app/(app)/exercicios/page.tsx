import { SectionCards } from "@/components/module/section-cards";
import { GoalTrainingCard } from "@/components/exercicios/goal-training-card";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { addExerciseSession } from "@/app/actions/exercise";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import type { ExerciseSession } from "@/types/database";
import { demoExercises } from "@/lib/demo/data";

export default async function ExerciciosOverviewPage() {
  let sessions: ExerciseSession[] = [];
  let bodyGoal: "lose" | "gain" | "maintain" | null = null;
  const demoMode = !isSupabaseConfigured();

  async function addExerciseSessionAction(formData: FormData): Promise<void> {
    "use server";
    await addExerciseSession(formData);
  }

  if (demoMode) {
    sessions = demoExercises;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("exercise_sessions")
          .select("*")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false })
          .limit(8);
        sessions = (data ?? []) as ExerciseSession[];
        const { data: p } = await supabase
          .from("profiles")
          .select("body_goal")
          .eq("id", user.id)
          .maybeSingle();
        bodyGoal = (p?.body_goal as typeof bodyGoal) ?? null;
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <p className="text-sm text-zinc-400">
        Treino e metabolismo — cada subárea tem página própria.
      </p>
      {!demoMode ? <GoalTrainingCard goal={bodyGoal} /> : null}
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
          <form action={addExerciseSessionAction} className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="label">Atividade</Label>
              <Input id="label" name="label" required placeholder="ex.: Caminhada leve" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="duration_min">Duração (min)</Label>
              <Input id="duration_min" name="duration_min" type="number" min={1} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="calories_burned">Calorias (est.)</Label>
              <Input id="calories_burned" name="calories_burned" type="number" min={0} />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="intensity">Intensidade</Label>
              <Input id="intensity" name="intensity" placeholder="leve / moderada / forte" />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="started_at_local">Horário real do treino</Label>
              <Input id="started_at_local" name="started_at_local" type="datetime-local" />
              <p className="text-[11px] text-zinc-600">Deixe em branco para usar o horário de agora.</p>
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="notes">Notas / contexto glicêmico (opcional)</Label>
              <Input id="notes" name="notes" placeholder="ex.: glicemia antes 140, depois 110" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Salvar sessão</Button>
            </div>
          </form>
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
