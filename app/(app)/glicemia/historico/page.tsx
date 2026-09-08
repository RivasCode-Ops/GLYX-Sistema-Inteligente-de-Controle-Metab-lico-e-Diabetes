import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import {
  aggregateGlucoseByDay,
  getGlucoseReadingsSince,
} from "@/lib/queries/glucose-series";
import { demoGlucosePoints } from "@/lib/demo/data";
import { createClient } from "@/lib/supabase/server";
import { ModuleTabs } from "@/components/ui/module-tabs";

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

  // Estatísticas do período, calculadas dos MESMOS dias que a lista abaixo
  // mostra — não de uma segunda consulta. Duas contagens da mesma grandeza em
  // telas diferentes é o defeito que já apareceu neste app.
  const totalLeituras = days.reduce((s, d) => s + d.count, 0);
  const mediaPeriodo = totalLeituras
    ? Math.round(days.reduce((s, d) => s + d.avg * d.count, 0) / totalLeituras)
    : null;
  const menor = days.length ? Math.min(...days.map((d) => d.min)) : null;
  const maior = days.length ? Math.max(...days.map((d) => d.max)) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <ModuleTabs />

      {days.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Média do período</p>
            <p className="font-mono text-2xl text-zinc-100">{mediaPeriodo ?? "—"}</p>
            <p className="text-xs text-zinc-500">
              {totalLeituras} leitura(s) em {days.length} dia(s)
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Menor valor</p>
            <p className="font-mono text-2xl text-zinc-100">{menor ?? "—"}</p>
            <p className="text-xs text-zinc-500">mg/dL</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Maior valor</p>
            <p className="font-mono text-2xl text-zinc-100">{maior ?? "—"}</p>
            <p className="text-xs text-zinc-500">mg/dL</p>
          </div>
        </div>
      ) : null}

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
