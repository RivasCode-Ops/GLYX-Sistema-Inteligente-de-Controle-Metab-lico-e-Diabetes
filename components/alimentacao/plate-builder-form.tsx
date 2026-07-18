"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhotoCaptureButtons } from "@/components/ui/photo-capture-buttons";
import { usePhotoSelection } from "@/lib/hooks/use-photo-selection";

type PlateResult = {
  plate: { item: string; portion: string }[];
  rationale: string;
  eatingOrder?: string[];
  estimated: { calories: number; carbs_g: number; protein_g: number; fat_g: number };
  tips: string[];
  limitations: string;
};

const MAX_PHOTOS = 4;

export function PlateBuilderForm() {
  const { files, previews, status, setStatus, loading, setLoading, selectMultiple } =
    usePhotoSelection();
  const [result, setResult] = useState<PlateResult | null>(null);

  async function onFilesChange(fileList: FileList | null) {
    setResult(null);
    await selectMultiple(fileList, MAX_PHOTOS);
  }

  async function onCameraShot(file: File | undefined) {
    if (!file) return;
    setResult(null);
    const dt = new DataTransfer();
    for (const existing of files) dt.items.add(existing);
    dt.items.add(file);
    await selectMultiple(dt.files, MAX_PHOTOS);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!files.length) {
      setStatus("Selecione ao menos uma foto da bancada.");
      return;
    }
    setLoading(true);
    setStatus("Analisando a bancada…");
    setResult(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("images", f);
      const res = await fetch("/api/ai/plate-builder", { method: "POST", body: fd });
      const data = (await res.json()) as PlateResult & { error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na análise.");
        return;
      }
      setResult(data);
      setStatus(null);
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fotos da bancada / despensa</CardTitle>
          <CardDescription>
            Fotografe o que você tem disponível. Bancada grande? Envie até {MAX_PHOTOS} fotos por
            ângulos diferentes — a IA junta tudo numa sugestão só.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <PhotoCaptureButtons
              accept="image/jpeg,image/png,image/webp"
              multiple
              onFile={(f) => void onCameraShot(f)}
              onFiles={(fl) => void onFilesChange(fl)}
              galleryLabel="🖼️ Escolher várias da galeria"
            />
            {previews.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {previews.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p}
                    src={p}
                    alt={`Foto ${i + 1} da bancada`}
                    className="h-28 w-full rounded-xl border border-zinc-800 object-cover"
                  />
                ))}
              </div>
            ) : null}
            <Button type="submit" disabled={loading}>
              {loading ? "Montando o prato…" : "Montar meu prato"}
            </Button>
            {status ? <p className="text-xs text-amber-300">{status}</p> : null}
            <p className="text-[11px] leading-4 text-zinc-600">
              Sugestão educativa baseada no que aparece nas fotos e nas suas metas glicêmicas — não
              é prescrição nutricional.
            </p>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <Card className="border-emerald-500/25">
          <CardHeader>
            <CardTitle className="text-base">Prato sugerido</CardTitle>
            <CardDescription>{result.rationale}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.plate.length ? (
              <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-950/40 text-sm">
                {result.plate.map((p) => (
                  <li key={p.item} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="text-zinc-200">{p.item}</span>
                    <span className="text-right text-xs text-zinc-500">{p.portion}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">Não identifiquei alimentos nas fotos.</p>
            )}

            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ["kcal", result.estimated.calories, "text-zinc-100"],
                ["carb", `${result.estimated.carbs_g}g`, "text-sky-300"],
                ["prot", `${result.estimated.protein_g}g`, "text-emerald-300"],
                ["gord", `${result.estimated.fat_g}g`, "text-amber-300"],
              ].map(([label, value, color]) => (
                <div key={label as string} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                  <p className={`font-mono text-lg ${color}`}>{value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
                </div>
              ))}
            </div>

            {result.eatingOrder?.length ? (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                <p className="mb-1 text-xs font-medium text-sky-300">🍽️ Ordem de consumo sugerida</p>
                <ol className="space-y-1 text-xs text-zinc-300">
                  {result.eatingOrder.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            {result.tips.length ? (
              <ul className="space-y-1 text-xs text-zinc-400">
                {result.tips.map((t) => (
                  <li key={t}>💡 {t}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-[11px] leading-4 text-zinc-600">{result.limitations}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
