import Link from "next/link";
import { demoExercises } from "@/lib/demo/data";

export default function ExerciciosSessoesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-sm text-zinc-400">Sessões recentes — clique para drill-down.</p>
      <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
        {demoExercises.map((s) => (
          <li key={s.id}>
            <Link
              href={`/exercicios/sessoes/${s.id}`}
              className="flex items-center justify-between px-4 py-4 text-sm hover:bg-zinc-800/50"
            >
              <span className="text-zinc-200">{s.label}</span>
              <span className="font-mono text-xs text-zinc-500">
                {s.calories_burned ?? "—"} kcal · {s.duration_min ?? "—"} min →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
