"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Report = {
  headline: string;
  reading: string;
  muscle: string;
  fat: string;
  training: string;
  metabolic: string;
  priorities: { title: string; why: string; action: string }[];
  caveats: string[];
};

function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      <p className="mt-0.5 text-sm leading-relaxed text-zinc-200">{text}</p>
    </div>
  );
}

/**
 * Relatório interpretativo. Os números vêm todos calculados do servidor
 * (lib/body) e vão no prompt como âncora — o modelo interpreta e escreve, não
 * calcula. Mesmo princípio das outras rotas de IA do app.
 */
export function AiReportCard({ enabled }: { enabled: boolean }) {
  const [result, setResult] = useState<Report | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/body-composition", { method: "POST" });
      const data = (await res.json()) as Report & { error?: string };
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
        <CardTitle className="text-base">Leitura da IA</CardTitle>
        <CardDescription>
          Cruza medidas, evolução do peso, carga dos treinos, recuperação, glicemia, sono e
          alimentação registrada — e explica o que os números querem dizer juntos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled ? (
          <Button onClick={() => void analyze()} disabled={loading}>
            {loading ? "Analisando…" : "Gerar análise"}
          </Button>
        ) : (
          <p className="text-sm text-zinc-400">
            A análise precisa de pelo menos duas medições para comparar. Registre a primeira hoje e
            repita em 3 a 4 semanas.
          </p>
        )}
        {status ? <p className="text-xs text-amber-300">{status}</p> : null}

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-sky-200">{result.headline}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-200">{result.reading}</p>
            </div>

            <Section title="Massa muscular" text={result.muscle} />
            <Section title="Gordura" text={result.fat} />
            <Section title="Treino" text={result.training} />
            <Section title="Metabolismo" text={result.metabolic} />

            {result.priorities.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Prioridades desta semana
                </h3>
                <ol className="mt-1 space-y-2">
                  {result.priorities.map((p, i) => (
                    <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                      <p className="text-sm font-medium text-zinc-100">
                        {i + 1}. {p.title}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400">{p.why}</p>
                      <p className="mt-1 text-xs text-sky-300">{p.action}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {result.caveats.length ? (
              <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-zinc-500">
                {result.caveats.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : null}

            <p className="text-[11px] leading-snug text-zinc-500">
              Análise educativa de autocuidado. Não é prescrição de dieta, treino terapêutico ou
              ajuste de medicação.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
