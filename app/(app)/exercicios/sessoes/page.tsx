import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ExerciseSession } from "@/types/database";
import { demoExercises } from "@/lib/demo/data";

export default async function ExerciciosSessoesPage() {
  let sessions: ExerciseSession[] = [];
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
        const { data } = await supabase
          .from("exercise_sessions")
          .select("*")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false });
        sessions = (data ?? []) as ExerciseSession[];
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-sm text-zinc-400">Sessões recentes — clique para drill-down.</p>
      {sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma sessão registrada ainda.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/exercicios/sessoes/${s.id}`}
                className="flex items-center justify-between px-4 py-4 text-sm hover:bg-zinc-800/50"
              >
                <div>
                  <span className="text-zinc-200">{s.label}</span>
                  <p className="text-xs text-zinc-500">
                    {new Date(s.started_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span className="font-mono text-xs text-zinc-500">
                  {s.calories_burned != null ? `${s.calories_burned} kcal · ` : ""}
                  {s.duration_min != null ? `${s.duration_min} min` : "—"} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
