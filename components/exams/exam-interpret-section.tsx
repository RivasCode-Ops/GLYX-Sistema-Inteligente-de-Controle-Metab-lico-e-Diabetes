"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runExamInterpretation } from "@/app/actions/exam-interpret";
import { importExamValue } from "@/app/actions/exam-import";
import { extractImportableValues, type ImportableValue } from "@/lib/exams/import-values";
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
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
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

  function importValue(item: ImportableValue) {
    setImportMsg(null);
    startTransition(() => {
      void (async () => {
        const fd = new FormData();
        fd.set("kind", item.kind);
        if (item.kind === "weight") fd.set("weightKg", String(item.weightKg));
        else fd.set("mgDl", String(item.mgDl));
        const r = await importExamValue(fd);
        if (r.error) {
          setImportMsg(r.error);
          return;
        }
        setImported((prev) => new Set(prev).add(item.label));
        setImportMsg(
          item.kind === "weight"
            ? "✅ Peso salvo no seu registro de hoje."
            : "✅ Glicemia de jejum salva no seu histórico."
        );
        router.refresh();
      })();
    });
  }

  const summary = initialSummary;
  const importables = summary?.values ? extractImportableValues(summary.values) : [];

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
            {summary.imageQuality || summary.regionOrLeadNote ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {summary.imageQuality ? (
                  <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
                    <span className="text-zinc-500">Qualidade: </span>
                    {summary.imageQuality}
                  </p>
                ) : null}
                {summary.regionOrLeadNote ? (
                  <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
                    <span className="text-zinc-500">Região / traçado: </span>
                    {summary.regionOrLeadNote}
                  </p>
                ) : null}
              </div>
            ) : null}
            {summary.findings?.length ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Achados descritivos
                </p>
                <ul className="space-y-1.5">
                  {summary.findings.map((f) => {
                    const style =
                      f.severity === "alterado"
                        ? "border-red-500/40 bg-red-500/10"
                        : f.severity === "atencao"
                          ? "border-amber-500/40 bg-amber-500/10"
                          : "border-zinc-700 bg-zinc-900/40";
                    return (
                      <li key={f.finding} className={`rounded-lg border px-3 py-2 ${style}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-zinc-100">{f.finding}</span>
                          <span className="text-[11px] uppercase text-zinc-500">{f.severity}</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{f.plainLanguage}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {summary.values?.length ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Valores identificados
                </p>
                <ul className="space-y-1.5">
                  {summary.values.map((v) => {
                    const style =
                      v.status === "alterado"
                        ? "border-red-500/40 bg-red-500/10 text-red-300"
                        : v.status === "atencao"
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
                    return (
                      <li
                        key={v.parameter}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${style}`}
                      >
                        <span className="font-medium">{v.parameter}</span>
                        <span className="font-mono text-xs">
                          {v.value}
                          {v.referenceRange ? ` (ref.: ${v.referenceRange})` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
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
            {importables.length ? (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-300/90">
                  Aproveitar valores no app
                </p>
                <div className="space-y-2">
                  {importables.map((item) => (
                    <div key={item.label} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-zinc-300">{item.label}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending || imported.has(item.label)}
                        onClick={() => importValue(item)}
                      >
                        {imported.has(item.label)
                          ? "Salvo ✓"
                          : item.kind === "weight"
                            ? "Salvar como peso de hoje"
                            : "Salvar na glicemia (jejum)"}
                      </Button>
                    </div>
                  ))}
                </div>
                {importMsg ? <p className="mt-2 text-xs text-emerald-200">{importMsg}</p> : null}
              </div>
            ) : null}
            {summary.lifestyleTopics?.length ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Hábitos e suplementação — para conversar com o médico
                </p>
                <ul className="space-y-2">
                  {summary.lifestyleTopics.map((t) => (
                    <li key={t.topic} className="rounded-lg border border-sky-900/40 bg-sky-950/20 px-3 py-2">
                      <span className="font-medium text-sky-300/90">{t.topic}</span>
                      <p className="mt-1 text-zinc-400">{t.whyItMatters}</p>
                      <p className="mt-1 text-xs text-zinc-500">💬 {t.discussWithDoctor}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-zinc-600">
                  Sugestões de assunto, não de conduta — dose e indicação são decisão do seu médico.
                </p>
              </div>
            ) : null}
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
