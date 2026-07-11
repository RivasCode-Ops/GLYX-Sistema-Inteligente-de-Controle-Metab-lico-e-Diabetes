import { isSupabaseConfigured } from "@/lib/env";
import { getGlucoseReadingsSince } from "@/lib/queries/glucose-series";
import { GlucoseTrendChart } from "@/components/glicemia/glucose-trend-chart";
import { demoGlucosePoints } from "@/lib/demo/data";

export default async function GlicemiaTendenciasPage() {
  let readings: Awaited<ReturnType<typeof getGlucoseReadingsSince>> = [];

  if (!isSupabaseConfigured()) {
    readings = demoGlucosePoints;
  } else {
    readings = await getGlucoseReadingsSince(14);
  }

  const last = readings.length ? readings[readings.length - 1] : null;
  const avg =
    readings.length > 0
      ? Math.round(
          readings.reduce((s, r) => s + r.value_mg_dl, 0) / readings.length
        )
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <p className="text-sm text-zinc-400">
        Últimos 14 dias — correlacione com refeições e sono nas próximas versões do motor de insights.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Última</p>
          <p className="font-mono text-2xl text-zinc-100">{last?.value_mg_dl ?? "—"}</p>
          <p className="text-xs text-zinc-500">mg/dL</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Média período</p>
          <p className="font-mono text-2xl text-zinc-100">{avg ?? "—"}</p>
          <p className="text-xs text-zinc-500">{readings.length} leituras</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Meta visual</p>
          <p className="font-mono text-2xl text-emerald-400/90">70–180</p>
          <p className="text-xs text-zinc-500">ajuste no perfil</p>
        </div>
      </div>
      <GlucoseTrendChart readings={readings} />
    </div>
  );
}
