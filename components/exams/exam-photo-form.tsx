"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePhotoSelection } from "@/lib/hooks/use-photo-selection";
import { EXAM_TYPE_LABEL, type ExamType } from "@/lib/exams/types";

type Result = { examId: string | null; title: string; examType?: ExamType };

const TYPES: { id: ExamType; hint: string }[] = [
  { id: "lab", hint: "Hemograma, HbA1c, laudo laboratorial" },
  { id: "ecg", hint: "Traçado ou laudo de eletrocardiograma" },
  { id: "rx", hint: "Radiografia ou laudo de imagem" },
];

export function ExamPhotoForm() {
  const router = useRouter();
  const { files: pages, previews, status, setStatus, loading, setLoading, selectSingle, reset } =
    usePhotoSelection({ allowPdf: true });
  const [title, setTitle] = useState("");
  const [examType, setExamType] = useState<ExamType>("lab");
  const [result, setResult] = useState<Result | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    await selectSingle(e.target.files?.[0]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    setResult(null);
    if (!pages.length) {
      setStatus("Selecione a foto ou o PDF do exame.");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      if (title.trim()) fd.set("title", title.trim());
      fd.set("examType", examType);
      for (const p of pages) fd.append("images", p);
      const res = await fetch("/api/ai/exam-photo", { method: "POST", body: fd });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na análise.");
        return;
      }
      setResult(data);
      reset();
      setTitle("");
      router.refresh();
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  const placeholder =
    examType === "ecg"
      ? "ex.: ECG de rotina jul/2026"
      : examType === "rx"
        ? "ex.: Raio-X tórax jul/2026"
        : "ex.: Hemograma jul/2026";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Novo registro por foto ou PDF</CardTitle>
        <CardDescription>
          Escolha o tipo (laboratorial, ECG ou Raio-X). O modelo descreve o que é legível e organiza
          perguntas para o médico — sem diagnóstico.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label>Tipo de exame</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setExamType(t.id)}
                  className={
                    examType === t.id
                      ? "rounded-xl border border-emerald-600/60 bg-emerald-500/10 px-3 py-2 text-left"
                      : "rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-left hover:border-zinc-500"
                  }
                >
                  <p className="text-sm font-medium text-zinc-100">{EXAM_TYPE_LABEL[t.id]}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{t.hint}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="photo-title">Título (opcional)</Label>
            <Input
              id="photo-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={placeholder}
            />
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            /* sem capture: o celular oferece camera OU galeria/arquivo */
            onChange={(e) => void onFileChange(e)}
            className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-900 file:px-3 file:py-2 file:text-sm file:text-emerald-100"
          />
          {previews.length ? (
            <div className={previews.length > 1 ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : ""}>
              {previews.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p}
                  src={p}
                  alt={`Página ${i + 1} do exame`}
                  className="max-h-64 w-full rounded-xl border border-zinc-800 object-contain"
                />
              ))}
            </div>
          ) : null}
          <Button type="submit" disabled={loading}>
            {loading
              ? "Analisando…"
              : `Analisar ${EXAM_TYPE_LABEL[examType].toLowerCase()}`}
          </Button>
          {status ? <p className="text-xs text-amber-300">{status}</p> : null}
          {result ? (
            <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-xs text-emerald-200">
              {result.examType ? `${EXAM_TYPE_LABEL[result.examType]} · ` : null}
              &ldquo;{result.title}&rdquo; salvo com interpretação.{" "}
              {result.examId ? (
                <Link href={`/exames/${result.examId}`} className="underline">
                  Abrir agora →
                </Link>
              ) : null}
            </p>
          ) : null}
          <p className="text-[11px] leading-4 text-zinc-600">
            Interpretação educativa — não é diagnóstico e não substitui o laudo oficial nem a
            avaliação médica.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
