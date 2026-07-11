"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type MealResult = {
  name?: string;
  calories?: number;
  carbs_g?: number;
  protein_g?: number;
  fat_g?: number;
  glycemic_load_estimate?: number;
  notes?: string;
};

export default function AlimentacaoFotoPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<MealResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
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
      setStatus("Selecione uma imagem.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/meal-photo", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { meal?: MealResult; error?: string; demo?: boolean };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na análise.");
        return;
      }
      if (data.demo) {
        setStatus("Configure a chave de IA no servidor para ativar a análise.");
        return;
      }
      setResult(data.meal ?? null);
      setStatus(null);
      form.reset();
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  const macros: { label: string; value: number | undefined; unit: string; color: string }[] = result
    ? [
        { label: "Carboidrato", value: result.carbs_g, unit: "g", color: "text-sky-300" },
        { label: "Proteína", value: result.protein_g, unit: "g", color: "text-emerald-300" },
        { label: "Gordura", value: result.fat_g, unit: "g", color: "text-amber-300" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <p className="text-sm text-zinc-400">
        Envie a foto do prato: o modelo estima calorias e macronutrientes por grupo e salva como
        refeição. Estimativa educativa — não substitui avaliação nutricional.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Foto da refeição</CardTitle>
          <CardDescription>JPEG, PNG ou WebP até 4 MB, boa iluminação para melhor estimativa.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
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
                alt="Pré-visualização da refeição"
                className="max-h-64 w-full rounded-xl border border-zinc-800 object-cover"
              />
            ) : null}
            <Button type="submit" disabled={loading}>
              {loading ? "Analisando…" : "Analisar e salvar"}
            </Button>
            {status ? <p className="text-xs text-amber-300">{status}</p> : null}
          </form>
        </CardContent>
      </Card>

      {result ? (
        <Card className="border-emerald-500/25">
          <CardHeader>
            <CardTitle className="text-base">{result.name ?? "Refeição analisada"}</CardTitle>
            <CardDescription>
              Salva no seu histórico de refeições.
              {typeof result.calories === "number" ? (
                <span className="ml-1 font-mono text-zinc-200">{result.calories} kcal</span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {macros.map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-center"
                >
                  <p className={`font-mono text-2xl ${m.color}`}>
                    {typeof m.value === "number" ? m.value : "—"}
                    <span className="text-xs text-zinc-500"> {m.unit}</span>
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">{m.label}</p>
                </div>
              ))}
            </div>
            {typeof result.glycemic_load_estimate === "number" ? (
              <p className="text-xs text-zinc-400">
                Carga glicêmica estimada:{" "}
                <span className="font-mono text-zinc-200">{result.glycemic_load_estimate}</span> /100
              </p>
            ) : null}
            {result.notes ? <p className="text-xs leading-5 text-zinc-500">{result.notes}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
