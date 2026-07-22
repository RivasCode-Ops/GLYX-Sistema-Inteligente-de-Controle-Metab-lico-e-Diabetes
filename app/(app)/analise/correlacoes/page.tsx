import { isSupabaseConfigured } from "@/lib/env";
import { listInsightFindings } from "@/lib/queries/insight-findings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshInsightsButton } from "@/components/insights/refresh-insights-button";
import { demoInsights } from "@/lib/demo/data";

export default async function AnaliseCorrelacoesPage() {
  const findings = isSupabaseConfigured() ? await listInsightFindings() : demoInsights;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">
            Cruza glicemia diária com sono, carboidratos e exercício, buscando correlações que
            ajudam a entender seu padrão. Heurísticas descritivas — não é diagnóstico. Para o score
            longitudinal e o plano de ação, veja a aba <span className="text-zinc-300">Resumo</span>.
          </p>
        </div>
        {isSupabaseConfigured() ? <RefreshInsightsButton /> : null}
      </div>

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
