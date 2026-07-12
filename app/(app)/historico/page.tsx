import { isSupabaseConfigured } from "@/lib/env";
import { getTimeline } from "@/lib/queries/timeline";
import { demoTimeline } from "@/lib/demo/data";

export default async function HistoricoGlobalPage() {
  let items: Awaited<ReturnType<typeof getTimeline>> = [];

  if (!isSupabaseConfigured()) {
    items = demoTimeline;
  } else {
    items = await getTimeline();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-sm text-zinc-400">
        Linha do tempo unificada — glicemia, refeições, medicação e exercício.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Sem eventos ou configure o Supabase.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
          {items.map((it) => (
            <li key={`${it.type}-${it.id}`} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="text-base leading-none">
                {{ glicemia: "🩸", refeição: "🍽️", medicação: "💊", exercício: "🏃" }[it.type]}
              </span>
              <div className="flex flex-1 flex-wrap justify-between gap-2">
                <span className="font-medium text-zinc-200">
                  {it.label} · {it.detail}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {new Date(it.at).toLocaleString("pt-BR")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
