"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMedication } from "@/app/actions/medications";
import { usePhotoSelection } from "@/lib/hooks/use-photo-selection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Cadastro por foto do rótulo: a IA lê nome/tipo/dose/estoque e pré-preenche;
// o usuário revisa, ajusta horários e salva — a própria foto fica anexada
// como rótulo do medicamento.

const DOSE_UNITS = [
  "mg",
  "g",
  "mcg",
  "ml",
  "U",
  "comprimido(s)",
  "cápsula(s)",
  "scoop",
  "gota(s)",
] as const;

type Draft = {
  name: string;
  kind: "med" | "supplement";
  dose_amount: string;
  dose_unit: string;
  dosage_text: string;
  schedule_hint: string;
  stock_units: string;
  reminder_times: string;
};

const SELECT_CLASS =
  "h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100";

export function AddMedicationByPhoto() {
  const router = useRouter();
  const { files, previews, status, setStatus, loading, setLoading, selectSingle, clear } =
    usePhotoSelection();
  const file = files[0] ?? null;
  const preview = previews[0] ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [limitations, setLimitations] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function analyze() {
    if (!file) {
      setStatus("Escolha ou tire a foto do rótulo primeiro.");
      return;
    }
    setStatus(null);
    setSaved(false);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("images", file);
      const res = await fetch("/api/ai/med-label", { method: "POST", body: fd });
      const data = (await res.json()) as {
        result?: {
          name: string;
          kind: "med" | "supplement";
          dose_amount: number | null;
          dose_unit: string | null;
          dosage_text: string;
          schedule_hint: string;
          stock_units: number | null;
          limitations: string;
        };
        error?: string;
      };
      if (!res.ok || !data.result) {
        setStatus(data.error ?? "Falha na leitura do rótulo.");
        return;
      }
      const r = data.result;
      setDraft({
        name: r.name,
        kind: r.kind,
        dose_amount: r.dose_amount != null ? String(r.dose_amount) : "",
        dose_unit: r.dose_unit ?? (r.kind === "supplement" ? "scoop" : "comprimido(s)"),
        dosage_text: r.dosage_text,
        schedule_hint: r.schedule_hint,
        stock_units: r.stock_units != null ? String(r.stock_units) : "",
        reminder_times: "",
      });
      setLimitations(r.limitations || null);
    } catch {
      setStatus("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.set("name", draft.name);
      fd.set("kind", draft.kind);
      fd.set("dose_amount", draft.dose_amount);
      fd.set("dose_unit", draft.dose_unit);
      fd.set("dosage", draft.dosage_text);
      fd.set("schedule_hint", draft.schedule_hint);
      fd.set("reminder_times", draft.reminder_times);
      fd.set("stock_units", draft.stock_units);
      if (file) fd.set("label_photo", file);
      const res = await addMedication(fd);
      if (res.error) {
        setStatus(res.error);
        return;
      }
      setSaved(true);
      setDraft(null);
      setLimitations(null);
      clear();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-sky-500/25">
      <CardHeader>
        <CardTitle className="text-base">📷 Cadastrar por foto do rótulo</CardTitle>
        <CardDescription>
          Fotografe a caixa/pote: a IA lê nome, tipo e dose, você confere, ajusta os horários e
          salva — a foto já fica guardada como rótulo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(e) => {
              setDraft(null);
              setSaved(false);
              void selectSingle(e.target.files?.[0]);
            }}
            className="text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-900 file:px-3 file:py-2 file:text-sm file:text-sky-100"
          />
          <Button type="button" onClick={() => void analyze()} disabled={loading || !file}>
            {loading ? "Lendo rótulo…" : "Ler rótulo"}
          </Button>
        </div>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Rótulo selecionado"
            className="max-h-40 rounded-xl border border-zinc-800 object-contain"
          />
        ) : null}
        {status ? <p className="text-xs text-amber-300">{status}</p> : null}
        {saved ? (
          <p className="text-xs text-emerald-300">✅ Cadastrado! Já aparece na lista abaixo.</p>
        ) : null}

        {draft ? (
          <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 sm:grid-cols-2">
            <div className="grid gap-1 sm:col-span-2">
              <Label>Nome</Label>
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>Tipo</Label>
              <select
                value={draft.kind}
                onChange={(e) => set("kind", e.target.value === "supplement" ? "supplement" : "med")}
                className={SELECT_CLASS}
              >
                <option value="med">Medicamento</option>
                <option value="supplement">Suplemento</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>Dose por vez</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={draft.dose_amount}
                  onChange={(e) => set("dose_amount", e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label>Unidade</Label>
                <select
                  value={draft.dose_unit}
                  onChange={(e) => set("dose_unit", e.target.value)}
                  className={SELECT_CLASS}
                >
                  {DOSE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u === "U" ? "U (insulina)" : u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label>Detalhe da dose (lido do rótulo)</Label>
              <Input
                value={draft.dosage_text}
                onChange={(e) => set("dosage_text", e.target.value)}
                placeholder="ex.: 500 mg por comprimido"
              />
            </div>
            <div className="grid gap-1">
              <Label>Alarmes (HH:MM, vírgula)</Label>
              <Input
                value={draft.reminder_times}
                onChange={(e) => set("reminder_times", e.target.value)}
                placeholder="ex.: 08:00, 20:00"
              />
            </div>
            <div className="grid gap-1">
              <Label>Estoque (opcional)</Label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.stock_units}
                onChange={(e) => set("stock_units", e.target.value)}
              />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label>Observação de horário</Label>
              <Input
                value={draft.schedule_hint}
                onChange={(e) => set("schedule_hint", e.target.value)}
                placeholder="ex.: após o café da manhã"
              />
            </div>
            {limitations ? (
              <p className="text-[11px] text-zinc-500 sm:col-span-2">
                A IA não conseguiu ler: {limitations}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="button" onClick={() => void save()} disabled={saving || !draft.name.trim()}>
                {saving ? "Salvando…" : "Confirmar e cadastrar"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
