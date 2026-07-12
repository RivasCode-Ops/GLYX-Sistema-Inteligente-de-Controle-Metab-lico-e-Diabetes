"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Feasibility = {
  verdict: "realista" | "agressiva" | "arriscada";
  summary: string;
  monthly_milestones: { month: number; weight_kg: number }[];
  factors_for: string[];
  factors_against: string[];
  risks: string[];
  recommendation: string;
  computed: {
    bmr: number;
    tdee: number;
    targets: { calories: number; protein_g: number };
    weeklyRateKg: number;
  };
};

const VERDICT_STYLE: Record<Feasibility["verdict"], string> = {
  realista: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  agressiva: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  arriscada: "border-red-500/40 bg-red-500/10 text-red-300",
};

export function GoalFeasibilityCard() {
  const [result, setResult] = useState<Feasibility | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/goal-feasibility", { method: "POST" });
      const data = (await res.json()) as Feasibility & { error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na análise.");
        setResult(null);
        return;
      }
      setResult(data);
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Viabilidade da meta</CardTitle>
        <CardDescription>
          A IA compara seu objetivo com estrutura física, histórico e saúde atual e devolve um
          veredito honesto com marcos mensais.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => void analyze()} disabled={loading}>
          {loading ? "Analisando…" : "Analisar minha meta"}
        </Button>
        {status ? <p className="text-xs text-amber-300">{status}</p> : null}

        {result ? (
          <div className="space-y-4">
            <div className={`rounded-xl border px-4 py-3 ${VERDICT_STYLE[result.verdict]}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">
                Meta {result.verdict}
              </p>
              <p className="mt-1 text-sm">{result.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {[
                ["Gasto diário", `${result.computed.tdee} kcal`],
                ["Meta calórica", `${result.computed.targets.calories} kcal`],
                ["Proteína/dia", `${result.computed.targets.protein_g} g`],
                ["Ritmo seguro", `${result.computed.weeklyRateKg} kg/sem`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                  <p className="font-mono text-sm text-zinc-100">{value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
                </div>
              ))}
            </div>

            {result.monthly_milestones.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-zinc-400">Marcos mensais</p>
                <div className="flex flex-wrap gap-2">
                  {result.monthly_milestones.map((m) => (
                    <span
                      key={m.month}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300"
                    >
                      Mês {m.month}: {m.weight_kg} kg
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-emerald-400">A seu favor</p>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {result.factors_for.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-amber-400">Pontos de atenção</p>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {result.factors_against.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </div>
            </div>

            {result.risks.length ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2">
                <p className="mb-1 text-xs font-medium text-red-300">Riscos</p>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {result.risks.map((r) => (
                    <li key={r}>⚠ {r}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-sm text-zinc-300">{result.recommendation}</p>
            <p className="text-[11px] leading-4 text-zinc-600">
              Análise educativa baseada em diretrizes (ADA/SBD) — não substitui avaliação médica ou
              nutricional.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
