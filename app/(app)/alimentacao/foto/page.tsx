"use client";

import { useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMealPhoto } from "@/app/actions/meals";
import { usePhotoSelection } from "@/lib/hooks/use-photo-selection";
import { GlycemicImpactRing } from "@/components/alimentacao/glycemic-impact-ring";
import { MacroGrid, type MacroField } from "@/components/alimentacao/macro-grid";

type Draft = {
  name: string;
  calories: string;
  carbs_g: string;
  protein_g: string;
  fat_g: string;
  glycemic_load_estimate: string;
  notes: string;
};

type DetectedItem = {
  name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
};

const MACRO_FIELDS: MacroField[] = ["calories", "carbs_g", "protein_g", "fat_g"];

export default function AlimentacaoFotoPage() {
  const { files, previews, status, setStatus, loading, setLoading, selectSingle, clear } =
    usePhotoSelection();
  const file = files[0] ?? null;
  const preview = previews[0] ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Snapshot da estimativa original da IA, para detectar ajustes do usuário. */
  const [aiDraft, setAiDraft] = useState<Draft | null>(null);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [eatingOrderTip, setEatingOrderTip] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const firstMacroInputRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDraft(null);
    setAiDraft(null);
    setDetectedItems([]);
    setEatingOrderTip(null);
    setSaved(false);
    await selectSingle(e.target.files?.[0]);
  }

  async function onAnalyze(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    setDraft(null);
    setAiDraft(null);
    setDetectedItems([]);
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
        meal?: Partial<Record<keyof Draft, string | number>> & {
          eating_order_tip?: string;
          items?: DetectedItem[];
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
      const parsed: Draft = {
        name: String(m.name ?? ""),
        calories: m.calories != null ? String(m.calories) : "",
        carbs_g: m.carbs_g != null ? String(m.carbs_g) : "",
        protein_g: m.protein_g != null ? String(m.protein_g) : "",
        fat_g: m.fat_g != null ? String(m.fat_g) : "",
        glycemic_load_estimate:
          m.glycemic_load_estimate != null ? String(m.glycemic_load_estimate) : "",
        notes: m.notes != null ? String(m.notes) : "",
      };
      setDraft(parsed);
      setAiDraft(parsed);
      setDetectedItems(Array.isArray(m.items) ? m.items : []);
      setEatingOrderTip(m.eating_order_tip ? String(m.eating_order_tip) : null);
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  function setField(field: keyof Draft, value: string) {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
  }

  function focusFirstMacro() {
    firstMacroInputRef.current?.focus();
    firstMacroInputRef.current?.select();
  }

  async function onSave() {
    if (!draft) return;
    setSaving(true);
    setStatus(null);
    try {
      const aiCorrected = aiDraft
        ? MACRO_FIELDS.some((f) => draft[f] !== aiDraft[f]) ||
          draft.glycemic_load_estimate !== aiDraft.glycemic_load_estimate
        : false;

      const fd = new FormData();
      Object.entries(draft).forEach(([k, v]) => fd.set(k, v));
      fd.set("ai_corrected", String(aiCorrected));
      if (file) fd.set("image", file);
      const res = await saveMealPhoto(fd);
      if (res.error) {
        setStatus(res.error);
        return;
      }
      setSaved(true);
      setDraft(null);
      setAiDraft(null);
      setDetectedItems([]);
      clear();
    } finally {
      setSaving(false);
    }
  }

  function onDiscard() {
    setDraft(null);
    setAiDraft(null);
    setDetectedItems([]);
    setEatingOrderTip(null);
    clear();
    setStatus(null);
  }

  const changedMacros = draft && aiDraft
    ? Object.fromEntries(MACRO_FIELDS.map((f) => [f, draft[f] !== aiDraft[f]]))
    : undefined;

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
              onChange={(e) => void onFileChange(e)}
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
            {eatingOrderTip ? (
              <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">
                🍽️ {eatingOrderTip}
              </p>
            ) : null}

            {detectedItems.length > 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">
                  Itens identificados na foto
                </p>
                <ul className="space-y-1 text-xs text-zinc-300">
                  {detectedItems.map((it, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate">{it.name}</span>
                      <span className="shrink-0 font-mono text-zinc-400">{Math.round(it.calories)} kcal</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-zinc-500">
                  Faltou algum item ou a divisão ficou errada? Ajuste os totais abaixo — os itens acima são
                  só pra conferência, o que é salvo são os totais.
                </p>
              </div>
            ) : null}

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <GlycemicImpactRing
                score={draft.glycemic_load_estimate ? Number(draft.glycemic_load_estimate) : null}
              />
            </div>

            <button
              type="button"
              onClick={focusFirstMacro}
              className="flex w-full items-center gap-2.5 rounded-xl bg-amber-500 px-3.5 py-2.5 text-left text-amber-950 transition hover:bg-amber-400"
            >
              <PenLine className="h-4 w-4 shrink-0" aria-hidden />
              <span className="text-xs font-medium">
                Os números não bateram? Ajuste abaixo — isso ajuda a IA a acertar mais da próxima vez.
              </span>
            </button>

            <div className="grid gap-1">
              <Label htmlFor="draft_name">Nome</Label>
              <Input
                id="draft_name"
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>

            <MacroGrid
              ref={firstMacroInputRef}
              values={draft}
              changed={changedMacros}
              onChange={setField}
            />

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
