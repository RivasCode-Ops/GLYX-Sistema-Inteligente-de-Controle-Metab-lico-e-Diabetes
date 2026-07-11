"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { examId: string | null; title: string };

export function ExamPhotoForm() {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null);
    setStatus(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    setResult(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("image");
    if (!(file instanceof File) || file.size === 0) {
      setStatus("Selecione a foto do exame.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/exam-photo", { method: "POST", body: fd });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na análise.");
        return;
      }
      setResult(data);
      form.reset();
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      router.refresh();
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Novo registro por foto</CardTitle>
        <CardDescription>
          Envie a foto do laudo: o modelo transcreve, explica termos e gera perguntas para o médico.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          <div className="grid gap-1">
            <Label htmlFor="photo-title">Título (opcional)</Label>
            <Input id="photo-title" name="title" placeholder="ex.: Hemograma jul/2026" />
          </div>
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
            className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-900 file:px-3 file:py-2 file:text-sm file:text-emerald-100"
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Pré-visualização do exame"
              className="max-h-64 w-full rounded-xl border border-zinc-800 object-contain"
            />
          ) : null}
          <Button type="submit" disabled={loading}>
            {loading ? "Lendo e interpretando…" : "Analisar foto do exame"}
          </Button>
          {status ? <p className="text-xs text-amber-300">{status}</p> : null}
          {result ? (
            <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 p-3 text-xs text-emerald-200">
              Exame &ldquo;{result.title}&rdquo; salvo com interpretação.{" "}
              {result.examId ? (
                <Link href={`/exames/${result.examId}`} className="underline">
                  Abrir agora →
                </Link>
              ) : null}
            </p>
          ) : null}
          <p className="text-[11px] leading-4 text-zinc-600">
            Interpretação educativa — não é diagnóstico e não substitui o laudo do laboratório nem a
            avaliação médica.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
