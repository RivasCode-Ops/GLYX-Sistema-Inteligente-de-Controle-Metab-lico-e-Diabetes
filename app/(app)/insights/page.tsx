import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { listInsightFindings } from "@/lib/queries/insight-findings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshInsightsButton } from "@/components/insights/refresh-insights-button";
import { demoInsights } from "@/lib/demo/data";

export default async function InsightsPage() {
  const findings = isSupabaseConfigured() ? await listInsightFindings() : demoInsights;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">
            Motor <strong className="text-zinc-300">v2</strong>: cruza glicemia diária com sono (
            <code className="font-mono text-xs">health_snapshots</code>), carboidratos (
            <code className="font-mono text-xs">meals</code>) e exercício (
            <code className="font-mono text-xs">exercise_sessions</code>). Heurísticas descritivas —
            não diagnóstico. Execute a migração{" "}
            <code className="font-mono text-xs">20260109150000_insight_findings.sql</code>.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Alertas clínicos por leitura extrema continuam em{" "}
            <Link href="/alertas" className="text-emerald-400 hover:underline">
              Alertas
            </Link>
            .
          </p>
        </div>
        {isSupabaseConfigured() ? <RefreshInsightsButton /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras legadas (leitura única)</CardTitle>
          <CardDescription>
            Hiper / hipo imediata — ver{" "}
            <code className="font-mono text-xs">lib/insights/rules.ts</code>.
          </CardDescription>
        </CardHeader>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Correlações (v2)</h2>
        {findings.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-sm text-zinc-500">
            Sem resultados ainda. Registe glicemia, refeições, sono ou exercício e clique em
            recalcular — são necessários vários dias com dados sobrepostos.
          </p>
        ) : (
          <ul className="space-y-3">
            {findings.map((f) => (
              <li key={f.slug}>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">{f.title}</CardTitle>
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] uppercase text-sky-400">
                        {f.severity}
                      </span>
                    </div>
                    <CardDescription className="font-mono text-[11px] text-zinc-600">
                      {f.slug} ·{" "}
                      {new Date(f.computed_at).toLocaleString("pt-BR")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed text-zinc-300">
                    {f.body}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
