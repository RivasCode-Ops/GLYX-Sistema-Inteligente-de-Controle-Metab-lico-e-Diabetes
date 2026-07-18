import Link from "next/link";
import { GoalTrainingCard } from "@/components/exercicios/goal-training-card";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { BodyGoal } from "@/lib/health/energy";

export default async function ExerciciosPlanoPage() {
  const demoMode = !isSupabaseConfigured();
  let bodyGoal: BodyGoal | null = null;

  if (!demoMode) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("body_goal")
          .eq("id", user.id)
          .maybeSingle();
        bodyGoal = (data?.body_goal as typeof bodyGoal) ?? null;
      }
    }
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
