import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getGlucoseReadingsSince } from "@/lib/queries/glucose-series";
import { GlucoseTrendChart } from "@/components/glicemia/glucose-trend-chart";
import { GlucoseRangeBar } from "@/components/glicemia/glucose-range-bar";
import { ModuleTabs } from "@/components/ui/module-tabs";
import { QuickReadingDialog } from "@/components/dashboard/quick-reading-dialog";
import { InsulinQuickDialog } from "@/components/glicemia/insulin-quick-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { demoGlucosePoints } from "@/lib/demo/data";
import { resolveGlucoseTargets } from "@/lib/health/glucose-thresholds";
import { readingAge } from "@/lib/health/reading-freshness";

// Visão geral + Tendências fundidas: antes eram duas telas mostrando a mesma
// "última leitura" e a mesma fonte (glucose_readings). Agora uma só traz o
// cartão da leitura atual com a régua da faixa, os tiles resumo e o gráfico dos
// últimos 14 dias.
export default async function GlicemiaOverviewPage() {
  let readings: Awaited<ReturnType<typeof getGlucoseReadingsSince>> = [];
  let { targetMin, targetMax } = resolveGlucoseTargets(null);

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
      ({ targetMin, targetMax } = resolveGlucoseTargets(p));
    }
  }

  const last = readings.length ? readings[readings.length - 1] : null;
  const avg =
    readings.length > 0
      ? Math.round(readings.reduce((s, r) => s + r.value_mg_dl, 0) / readings.length)
      : null;

  const idade = last?.recorded_at ? readingAge(last.recorded_at) : null;

  // A distância até a meta é dita em número, não em adjetivo: "7 acima" é
  // acionável, "Moderado" sozinho não é.
  const distancia =
    last == null
      ? null
      : last.value_mg_dl > targetMax
        ? { texto: `${last.value_mg_dl - targetMax} acima da meta`, cor: "text-amber-300" }
        : last.value_mg_dl < targetMin
          ? { texto: `${targetMin - last.value_mg_dl} abaixo da meta`, cor: "text-red-300" }
          : { texto: "dentro da meta", cor: "text-emerald-300" };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ModuleTabs />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Leitura atual, com a régua ao lado do número. */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                {idade?.freshness === "fresh" ? "Glicemia atual" : "Última leitura"}
              </p>
              {idade ? (
                <span
                  className={
                    idade.freshness === "stale" ? "text-xs text-amber-300" : "text-xs text-zinc-500"
                  }
                >
                  {idade.label}
                </span>
              ) : null}
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-5xl text-zinc-50">{last?.value_mg_dl ?? "—"}</span>
              <span className="text-sm text-zinc-500">
                {last ? "mg/dL" : "sem leitura registrada"}
              </span>
              {distancia ? (
                <span className={`ml-auto text-sm ${distancia.cor}`}>{distancia.texto}</span>
              ) : null}
            </div>

            <GlucoseRangeBar
              value={last?.value_mg_dl ?? null}
              targetMin={targetMin}
              targetMax={targetMax}
              className="mt-4"
            />

            <p className="mt-3 text-xs text-zinc-500">
              Sua meta: {targetMin}–{targetMax} mg/dL — definida com seu médico, ajustável no Perfil.
            </p>
          </CardContent>
        </Card>

        {/* Ações. Registrar leitura é a primária; insulina extra abre o
            formulário e não grava por si, com os campos obrigatórios. */}
        <Card>
          <CardContent className="flex h-full flex-col justify-center gap-3 p-5">
            <QuickReadingDialog />
            <InsulinQuickDialog
              latestGlucose={idade?.freshness === "fresh" ? (last?.value_mg_dl ?? null) : null}
            />
            <p className="text-[11px] leading-4 text-zinc-600">
              O GLYX registra a dose que você aplicou conforme orientação médica — nunca sugere
              quantidade.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Última</p>
          <p className="font-mono text-2xl text-zinc-100">{last?.value_mg_dl ?? "—"}</p>
          <p className="text-xs text-zinc-500">{idade ? idade.label : "mg/dL"}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Média (14 dias)</p>
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

      <div>
        <div className="mb-2 flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium text-zinc-300">Tendência dos últimos 14 dias</h2>
          <Link
            href="/glicemia/historico"
            className="text-xs font-medium text-emerald-400 hover:underline"
          >
            Ver histórico →
          </Link>
        </div>
        <GlucoseTrendChart readings={readings} />
      </div>

      {/* NÃO ENTROU, e é decisão: o modelo de referência traz aqui um card
          sugerindo "uma caminhada de 15 minutos pode ajudar" e uma "Dica do
          dia".

          A sugestão de caminhada é a mesma que foi removida em 07/09/2026 por
          risco clínico — com insulina rápida ativa, exercício SOMA ao efeito
          hipoglicemiante, e esta tela não olha `insulin_logs`. Ela volta pelo
          card de ação do painel, que passa por `exerciseSuppressed`.

          A "dica do dia" é texto genérico que não olha dado nenhum — o mesmo
          que o briefing do card proíbe ("mensagem motivacional, dica genérica").
          Ocupa espaço de decisão sem carregar informação. */}

      <Link
        href="/integracoes"
        className="inline-block text-sm font-medium text-emerald-400 hover:underline"
      >
        Conectar sensor (CGM) →
      </Link>
    </div>
  );
}
