import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import {
  aggregateGlucoseByDay,
  getGlucoseReadingsSince,
} from "@/lib/queries/glucose-series";
import { demoGlucosePoints } from "@/lib/demo/data";
import { createClient } from "@/lib/supabase/server";

export default async function GlicemiaHistoricoPage() {
  let days: ReturnType<typeof aggregateGlucoseByDay> = [];

  if (!isSupabaseConfigured()) {
    days = aggregateGlucoseByDay(demoGlucosePoints);
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    const { data: profile } = user
      ? await supabase!.from("profiles").select("timezone").eq("id", user.id).maybeSingle()
      : { data: null };

    const readings = await getGlucoseReadingsSince(120);
    days = aggregateGlucoseByDay(readings, profile?.timezone);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-sm text-zinc-400">
        Dias com pelo menos uma leitura — abra para ver detalhe por data (YYYY-MM-DD).
      </p>
      {days.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center text-sm text-zinc-500">
          Nenhum registro ou configure o Supabase e adicione leituras.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
          {days.map((d) => (
            <li key={d.day}>
              <Link
                href={`/glicemia/${d.day}`}
                className="flex items-center justify-between px-4 py-4 text-sm transition hover:bg-zinc-800/50"
              >
                <span className="font-medium text-zinc-200">
                  {new Date(d.day + "T12:00:00").toLocaleDateString("pt-BR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  média {d.avg} · {d.count} leituras · min {d.min} / máx {d.max} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
