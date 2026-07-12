import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { deleteExerciseSession } from "@/app/actions/exercise";
import { Button } from "@/components/ui/button";
import type { ExerciseSession } from "@/types/database";
import { demoExercises } from "@/lib/demo/data";

type Props = { params: Promise<{ id: string }> };

export default async function ExercicioSessaoDetailPage({ params }: Props) {
  const { id } = await params;
  const demoMode = !isSupabaseConfigured();

  async function deleteAction(formData: FormData): Promise<void> {
    "use server";
    await deleteExerciseSession(formData);
    redirect("/exercicios/sessoes");
  }

  let session: ExerciseSession | undefined;
  if (demoMode) {
    session = demoExercises.find((s) => s.id === id);
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
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();
        session = (data ?? undefined) as ExerciseSession | undefined;
      }
    }
  }

  if (!session) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/exercicios/sessoes" className="text-sm text-emerald-400 hover:underline">
        ← Voltar às sessões
      </Link>
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">{session.label}</h2>
        <p className="text-sm text-zinc-500">
          {new Date(session.started_at).toLocaleString("pt-BR")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Duração", session.duration_min != null ? `${session.duration_min} min` : "—"],
          ["Calorias", session.calories_burned != null ? `${session.calories_burned} kcal` : "—"],
          ["Intensidade", session.intensity ?? "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="font-mono text-sm text-zinc-100">{value}</p>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
          </div>
        ))}
      </div>

      {session.notes ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <p className="mb-1 text-xs font-medium text-zinc-400">Notas / contexto glicêmico</p>
          <p className="text-sm text-zinc-200">{session.notes}</p>
        </div>
      ) : null}

      {!demoMode ? (
        <form action={deleteAction}>
          <input type="hidden" name="id" value={session.id} />
          <Button type="submit" variant="ghost" className="text-zinc-500 hover:text-red-300">
            Excluir sessão
          </Button>
        </form>
      ) : null}
    </div>
  );
}
