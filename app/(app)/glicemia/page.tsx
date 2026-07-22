import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getGlucoseReadingsSince } from "@/lib/queries/glucose-series";
import { GlucoseTrendChart } from "@/components/glicemia/glucose-trend-chart";
import { demoGlucosePoints } from "@/lib/demo/data";

// Visão geral + Tendências fundidas: antes eram duas telas mostrando a mesma
// "última leitura" e a mesma fonte (glucose_readings). Agora uma só traz os
// tiles resumo e o gráfico dos últimos 14 dias.
export default async function GlicemiaOverviewPage() {
  let readings: Awaited<ReturnType<typeof getGlucoseReadingsSince>> = [];
  let targetMin = 70;
  let targetMax = 180;

  if (!isSupabaseConfigured()) {
    readings = demoGlucosePoints;
  } else {
    readings = await getGlucoseReadingsSince(14);
    const supabase = await createClient();
    const {
      data: { user },
    } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    if (supabase && user) {
      const { data: p } = await supabase
        .from("profiles")
        .select("target_glucose_min, target_glucose_max")
        .eq("id", user.id)
        .maybeSingle();
      targetMin = p?.target_glucose_min ?? 70;
      targetMax = p?.target_glucose_max ?? 180;
    }
  }

  const last = readings.length ? readings[readings.length - 1] : null;
  const avg =
    readings.length > 0
      ? Math.round(readings.reduce((s, r) => s + r.value_mg_dl, 0) / readings.length)
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <p className="text-sm text-zinc-400">
        Últimos 14 dias. Registre pelo painel; o histórico por dia e a pressão ficam nas abas acima.
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
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Sua meta</p>
          <p className="font-mono text-2xl text-emerald-400/90">
            {targetMin}–{targetMax}
          </p>
          <p className="text-xs text-zinc-500">ajuste no Perfil, com seu médico</p>
        </div>
      </div>
      <GlucoseTrendChart readings={readings} />
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/glicemia/historico" className="font-medium text-emerald-400 hover:underline">
          Ver histórico completo →
        </Link>
        <Link href="/integracoes" className="font-medium text-emerald-400 hover:underline">
          Conectar sensor (CGM) →
        </Link>
      </div>
    </div>
  );
}
