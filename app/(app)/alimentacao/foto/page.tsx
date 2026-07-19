"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhotoCaptureButtons } from "@/components/ui/photo-capture-buttons";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { saveMealPhotoItems } from "@/app/actions/meals";
import { usePhotoSelection } from "@/lib/hooks/use-photo-selection";
import { glycemicTier, GLYCEMIC_TIER_LABEL, type GlycemicTier } from "@/lib/health/glycemic-tier";

const GLYCEMIC_PILL_TONE: Record<GlycemicTier, PillTone> = {
  baixo: "emerald",
  medio: "amber",
  alto: "red",
};

type ItemDraft = {
  name: string;
  calories: string;
  carbs_g: string;
  protein_g: string;
  fat_g: string;
  glycemic_load_estimate: string;
  implication: string;
  included: boolean;
};

type RawItem = {
  name?: string;
  calories?: number;
  carbs_g?: number;
  protein_g?: number;
  fat_g?: number;
  glycemic_load_estimate?: number;
  implication?: string;
};

function toItemDraft(it: RawItem): ItemDraft {
  return {
    name: it.name ?? "Item",
    calories: it.calories != null ? String(it.calories) : "",
    carbs_g: it.carbs_g != null ? String(it.carbs_g) : "",
    protein_g: it.protein_g != null ? String(it.protein_g) : "",
    fat_g: it.fat_g != null ? String(it.fat_g) : "",
    glycemic_load_estimate: it.glycemic_load_estimate != null ? String(it.glycemic_load_estimate) : "",
    implication: it.implication ?? "",
    included: true,
  };
}

export default function AlimentacaoFotoPage() {
  const { files, previews, status, setStatus, loading, setLoading, selectSingle, clear } =
    usePhotoSelection();
  const file = files[0] ?? null;
  const preview = previews[0] ?? null;
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [aiItems, setAiItems] = useState<ItemDraft[]>([]);
  const [eatingOrderTip, setEatingOrderTip] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function reset() {
    setItems([]);
    setAiItems([]);
    setEatingOrderTip(null);
    setSaved(false);
  }

  async function onFileChange(file: File | undefined) {
    reset();
    await selectSingle(file);
  }

  async function onAnalyze(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    reset();
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
        meal?: {
          name?: string;
          calories?: number;
          carbs_g?: number;
          protein_g?: number;
          fat_g?: number;
          eating_order_tip?: string;
          items?: RawItem[];
        };
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
      const rawItems = Array.isArray(m.items) && m.items.length > 0 ? m.items : [
        {
          name: m.name,
          calories: m.calories,
          carbs_g: m.carbs_g,
          protein_g: m.protein_g,
          fat_g: m.fat_g,
        },
      ];
      const drafts = rawItems.map(toItemDraft);
      setItems(drafts);
      setAiItems(drafts);
      setEatingOrderTip(m.eating_order_tip ? String(m.eating_order_tip) : null);
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  function setItemField(index: number, field: keyof ItemDraft, value: string | boolean) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  async function onSave() {
    const included = items
      .map((it, index) => ({ it, index }))
      .filter(({ it }) => it.included && it.name.trim());
    if (included.length === 0) {
      setStatus("Marque pelo menos um item pra salvar.");
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const payload = included.map(({ it, index }) => {
        const ai = aiItems[index];
        const corrected = ai
          ? it.calories !== ai.calories ||
            it.carbs_g !== ai.carbs_g ||
            it.protein_g !== ai.protein_g ||
            it.fat_g !== ai.fat_g
          : false;
        return {
          name: it.name.trim(),
          calories: it.calories,
          carbs_g: it.carbs_g,
          protein_g: it.protein_g,
          fat_g: it.fat_g,
          glycemic_load_estimate: it.glycemic_load_estimate,
          notes: it.implication,
          ai_corrected: corrected,
        };
      });
      const fd = new FormData();
      fd.set("items", JSON.stringify(payload));
      if (file) fd.set("image", file);
      const res = await saveMealPhotoItems(fd);
      if (res.error) {
        setStatus(res.error);
        return;
      }
      setSaved(true);
      setItems([]);
      setAiItems([]);
      clear();
    } finally {
      setSaving(false);
    }
  }

  function onDiscard() {
    reset();
    clear();
    setStatus(null);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <p className="text-sm text-zinc-400">
        Envie a foto do prato: o modelo identifica cada item separado (prato, bebida, acompanhamento
        etc.) e estima calorias e macros de cada um. Você revisa, escolhe quais contar, e cada item
        salvo vira um registro próprio — não uma refeição só com tudo somado.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Foto da refeição</CardTitle>
          <CardDescription>JPEG, PNG ou WebP até 4 MB, boa iluminação para melhor estimativa.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onAnalyze(e)} className="space-y-4">
            <PhotoCaptureButtons
              accept="image/jpeg,image/png,image/webp"
              onFile={(f) => void onFileChange(f)}
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
              <p className="text-xs text-emerald-300">✅ Itens salvos no seu consumo de hoje.</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {items.length > 0 ? (
        <Card className="border-emerald-500/25">
          <CardHeader>
            <CardTitle className="text-base">Revisar antes de salvar</CardTitle>
            <CardDescription>
              Cada item vira uma refeição separada. Desmarque o que não quiser contar, ajuste os
              números se precisar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {eatingOrderTip ? (
              <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">
                🍽️ {eatingOrderTip}
              </p>
            ) : null}

            <div className="space-y-3">
              {items.map((it, i) => {
                const glyc = it.glycemic_load_estimate ? Number(it.glycemic_load_estimate) : null;
                const tier = glyc != null ? glycemicTier(glyc) : null;
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-3 transition-colors ${
                      it.included ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800/50 bg-zinc-900/10 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={it.included}
                        onChange={(e) => setItemField(i, "included", e.target.checked)}
                        className="mt-2.5 h-4 w-4 shrink-0 accent-emerald-500"
                        aria-label={`Incluir ${it.name}`}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            value={it.name}
                            onChange={(e) => setItemField(i, "name", e.target.value)}
                            className="h-8 flex-1 text-sm"
                          />
                          {tier ? (
                            <StatusPill tone={GLYCEMIC_PILL_TONE[tier]} className="text-[10px]">
                              {GLYCEMIC_TIER_LABEL[tier]}
                            </StatusPill>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          {(
                            [
                              ["calories", "kcal"],
                              ["carbs_g", "carb g"],
                              ["protein_g", "prot g"],
                              ["fat_g", "gord g"],
                            ] as const
                          ).map(([field, label]) => (
                            <div key={field} className="text-center">
                              <input
                                type="number"
                                value={it[field]}
                                onChange={(e) => setItemField(i, field, e.target.value)}
                                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-1 py-1 text-center font-mono text-xs text-zinc-100"
                              />
                              <p className="mt-0.5 text-[9px] text-zinc-600">{label}</p>
                            </div>
                          ))}
                        </div>

                        {it.implication ? (
                          <p className="text-[11px] leading-snug text-zinc-400">💡 {it.implication}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Salvando…" : "Salvar itens marcados"}
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
