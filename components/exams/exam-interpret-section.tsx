"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runExamInterpretation } from "@/app/actions/exam-interpret";
import type { ParsedExamSummary } from "@/lib/exams/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  examId: string;
  initialSummary: ParsedExamSummary | null;
  openAiConfigured: boolean;
};

export function ExamInterpretSection({ examId, initialSummary, openAiConfigured }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setMsg(null);
    startTransition(() => {
      void (async () => {
        const r = await runExamInterpretation(examId);
        if (r.error) setMsg(r.error);
        else router.refresh();
      })();
    });
  }

  const summary = initialSummary;

  return (
    <div className="space-y-4">
      <Card className="border-sky-900/40 bg-sky-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-sky-100">Interpretação assistida (educativa)</CardTitle>
          <CardDescription className="text-sky-200/70">
            Não substitui o médico nem o laudo oficial. Serve para organizar dúvidas e termos em linguagem
            simples.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!openAiConfigured ? (
            <p className="text-sm text-amber-200/90">
              Configure <code className="font-mono text-xs">OPENAI_API_KEY</code> no servidor para gerar o
              resumo estruturado.
            </p>
          ) : (
            <Button type="button" variant="outline" disabled={pending} onClick={run}>
              {pending ? "A processar…" : summary ? "Regenerar resumo" : "Gerar resumo educativo"}
            </Button>
          )}
          {msg ? <p className="text-xs text-red-400">{msg}</p> : null}
        </CardContent>
      </Card>

      {summary ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-zinc-300">
            <p>{summary.summary}</p>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Termos
              </p>
              <ul className="space-y-2">
                {summary.terms.map((t) => (
                  <li key={t.term} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                    <span className="font-medium text-emerald-400/90">{t.term}</span>
                    <p className="mt-1 text-zinc-400">{t.plainLanguage}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Perguntas para o médico
              </p>
              <ul className="list-inside list-disc space-y-1 text-zinc-400">
                {summary.questionsForDoctor.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
            <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-500">
              <strong className="text-zinc-400">Limitações:</strong> {summary.limitations}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
