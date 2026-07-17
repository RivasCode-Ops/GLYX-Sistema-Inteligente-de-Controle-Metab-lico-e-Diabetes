import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { listMetabolicAudits } from "@/lib/audit/run";
import type { AuditFactor, AuditPlanItem, MetabolicAuditRow } from "@/lib/audit/types";
import { GenerateAuditButton } from "@/components/audit/generate-audit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const LABEL_STYLE: Record<string, string> = {
  Estável: "bg-emerald-500/15 text-emerald-300",
  Atenção: "bg-amber-500/15 text-amber-300",
  Alerta: "bg-red-500/15 text-red-300",
  "Dados insuficientes": "bg-zinc-700/40 text-zinc-300",
};

const SEV_STYLE: Record<string, string> = {
  info: "text-sky-400",
  warning: "text-amber-400",
  critical: "text-red-400",
};

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-zinc-100">{value}</p>
    </div>
  );
}

function AuditDetail({ audit }: { audit: MetabolicAuditRow }) {
  const factors = (audit.factors ?? []) as AuditFactor[];
  const plan = (audit.plan ?? []) as AuditPlanItem[];
  const m = audit.metrics;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-3xl font-semibold text-zinc-50">{audit.score}</p>
            <span className="text-sm text-zinc-500">/ 100</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LABEL_STYLE[audit.label] ?? LABEL_STYLE["Dados insuficientes"]}`}
            >
              {audit.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Janela {audit.window_days} dias · {audit.period_start} → {audit.period_end} ·{" "}
            {new Date(audit.computed_at).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell label="TIR" value={m.tirPercent != null ? `${m.tirPercent}%` : "—"} />
        <MetricCell label="Média" value={m.avgGlucose != null ? `${m.avgGlucose} mg/dL` : "—"} />
        <MetricCell label="Hipos" value={String(m.hypoCount)} />
        <MetricCell label="Hipers" value={String(m.hyperCount)} />
        <MetricCell label="Leituras" value={`${m.readingCount} · ${m.daysWithGlucose} dias`} />
        <MetricCell
          label="Exercício"
          value={
            m.avgExerciseMin != null
              ? `${m.activeDays} dias ativos · ~${m.avgExerciseMin} min`
              : `${m.activeDays} dias ativos`
          }
        />
        <MetricCell
          label="Sono"
          value={m.avgSleepHours != null ? `~${m.avgSleepHours} h · ${m.lowSleepDays} curtas` : "—"}
        />
        <MetricCell
          label="Carbs / dia"
          value={m.avgCarbsPerDay != null ? `${m.avgCarbsPerDay} g` : "—"}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-300">Fatores de risco</h3>
        {factors.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum fator negativo relevante neste período.</p>
        ) : (
          <ul className="space-y-2">
            {factors.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-zinc-100">{f.label}</p>
                  <span className={`text-[11px] uppercase ${SEV_STYLE[f.severity] ?? "text-zinc-400"}`}>
                    {f.severity} · −{f.scoreImpact}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{f.evidence}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-300">Plano sugerido</h3>
        <ol className="space-y-2">
          {plan.map((p) => (
            <li
              key={`${p.priority}-${p.title}`}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm"
            >
              <p className="font-medium text-zinc-100">
                {p.priority}. {p.title}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{p.why}</p>
              <Link
                href={p.href}
                className="mt-2 inline-block text-xs font-medium text-emerald-400 hover:underline"
              >
                {p.actionLabel} →
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default async function MapaRiscoPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-zinc-500">
          Configure o Supabase para gerar o mapa de risco a partir dos seus registros.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  let audits: MetabolicAuditRow[] = [];
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) audits = await listMetabolicAudits(supabase, user.id, 8);
  }

  const latest = audits[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">Mapa de risco</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Auditoria metabólica longitudinal: cruza glicemia, refeições, exercício, sono, água,
            medicação, insulina e exames. Score educativo para o seu controle — não substitui
            avaliação médica.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Correlações descritivas continuam em{" "}
            <Link href="/insights" className="text-emerald-400 hover:underline">
              Insights
            </Link>
            . Execute a migration{" "}
            <code className="font-mono text-[11px]">20260717120000_metabolic_audits.sql</code>.
          </p>
        </div>
        <GenerateAuditButton />
      </div>

      {latest ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Último relatório</CardTitle>
            <CardDescription>Snapshot versionado — novos cálculos não apagam o histórico.</CardDescription>
          </CardHeader>
          <CardContent>
            <AuditDetail audit={latest} />
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-sm text-zinc-500">
          Ainda sem auditoria. Registre glicemia e hábitos e clique em gerar mapa.
        </p>
      )}

      {audits.length > 1 ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-100">Histórico</h2>
          <ul className="space-y-2">
            {audits.slice(1).map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-zinc-200">
                    Score {a.score} · {a.label}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {a.window_days}d · {a.period_start} → {a.period_end}
                  </p>
                </div>
                <p className="text-xs text-zinc-600">
                  {new Date(a.computed_at).toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
