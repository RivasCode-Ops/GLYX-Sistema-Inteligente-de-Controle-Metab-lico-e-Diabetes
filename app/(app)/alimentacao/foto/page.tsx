"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMealPhoto } from "@/app/actions/meals";

type Draft = {
  name: string;
  calories: string;
  carbs_g: string;
  protein_g: string;
  fat_g: string;
  glycemic_load_estimate: string;
  notes: string;
};

export default function AlimentacaoFotoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setDraft(null);
    setSaved(false);
    setStatus(null);
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function onAnalyze(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    setDraft(null);
    setSaved(false);
    if (!file) {
      setStatus("Selecione uma imagem.");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("image", file);
      const res = await fetch("/api/ai/meal-photo", { method: "POST", body: fd });
      const data = (await res.json()) as {
        meal?: Partial<Record<keyof Draft, string | number>>;
        error?: string;
        demo?: boolean;
      };
      if (!res.ok) {
        setStatus(data.error ?? "Falha na análise.");
        return;
      }
      if (data.demo) {
        setStatus("Configure a chave de IA no servidor para ativar a análise.");
        return;
      }
      const m = data.meal ?? {};
      setDraft({
        name: String(m.name ?? ""),
        calories: m.calories != null ? String(m.calories) : "",
        carbs_g: m.carbs_g != null ? String(m.carbs_g) : "",
        protein_g: m.protein_g != null ? String(m.protein_g) : "",
        fat_g: m.fat_g != null ? String(m.fat_g) : "",
        glycemic_load_estimate:
          m.glycemic_load_estimate != null ? String(m.glycemic_load_estimate) : "",
        notes: m.notes != null ? String(m.notes) : "",
      });
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  function setField(field: keyof Draft, value: string) {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
  }

  async function onSave() {
    if (!draft) return;
    setSaving(true);
    setStatus(null);
    try {
      const fd = new FormData();
      Object.entries(draft).forEach(([k, v]) => fd.set(k, v));
      if (file) fd.set("image", file);
      const res = await saveMealPhoto(fd);
      if (res.error) {
        setStatus(res.error);
        return;
      }
      setSaved(true);
      setDraft(null);
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
    } finally {
      setSaving(false);
    }
  }

  function onDiscard() {
    setDraft(null);
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setStatus(null);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <p className="text-sm text-zinc-400">
        Envie a foto do prato: o modelo estima calorias e macronutrientes. Você revisa e decide se
        conta no seu consumo diário antes de salvar.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Foto da refeição</CardTitle>
          <CardDescription>JPEG, PNG ou WebP até 4 MB, boa iluminação para melhor estimativa.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onAnalyze(e)} className="space-y-4">
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
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
            <Button type="submit" disabled={loading || !file}>
              {loading ? "Analisando…" : "Analisar"}
            </Button>
            {status ? <p className="text-xs text-amber-300">{status}</p> : null}
            {saved ? (
              <p className="text-xs text-emerald-300">✅ Refeição salva no seu consumo de hoje.</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {draft ? (
        <Card className="border-emerald-500/25">
          <CardHeader>
            <CardTitle className="text-base">Revisar antes de salvar</CardTitle>
            <CardDescription>
              Ajuste o que a IA estimou — ou descarte se não quiser contar esta refeição.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1">
              <Label htmlFor="draft_name">Nome</Label>
              <Input
                id="draft_name"
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["calories", "Kcal"],
                  ["carbs_g", "Carbo (g)"],
                  ["protein_g", "Proteína (g)"],
                  ["fat_g", "Gordura (g)"],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="grid gap-1">
                  <Label htmlFor={field} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={field}
                    type="number"
                    value={draft[field]}
                    onChange={(e) => setField(field, e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Salvando…" : "Salvar no consumo de hoje"}
              </Button>
              <Button type="button" variant="ghost" onClick={onDiscard} disabled={saving}>
                Descartar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
