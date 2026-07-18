"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMedication, findSimilarActiveMedications, type SimilarMedication } from "@/app/actions/medications";
import { usePhotoSelection } from "@/lib/hooks/use-photo-selection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReminderTimesField } from "@/components/medicacao/reminder-times-field";
import { DOSE_UNITS, doseUnitLabel } from "@/lib/medications/dose-units";

// Cadastro por foto do rótulo: a IA lê nome/tipo/dose/estoque e pré-preenche;
// o usuário revisa, ajusta horários e salva — a própria foto fica anexada
// como rótulo do medicamento.

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
  const [similar, setSimilar] = useState<SimilarMedication[]>([]);

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
      setSimilar(await findSimilarActiveMedications(r.name));
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
      setSimilar([]);
      clear();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            /* sem capture: o celular oferece camera OU galeria/arquivo */
            onChange={(e) => {
              setDraft(null);
              setSaved(false);
              setSimilar([]);
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
                      {doseUnitLabel(u)}
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
              <Label>Alarmes de dose</Label>
              <ReminderTimesField onChange={(v) => set("reminder_times", v)} />
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
            {similar.length ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200 sm:col-span-2">
                <p className="font-medium">Você já tem algo parecido cadastrado:</p>
                <ul className="mt-1 space-y-0.5">
                  {similar.map((m) => (
                    <li key={m.id}>
                      {m.name}
                      {m.dosage ? ` · ${m.dosage}` : ""}
                      {m.stock_units != null ? ` · estoque: ${m.stock_units}` : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-amber-300/80">
                  Se for a mesma caneta/pote, cancele aqui e use &quot;Atualizar estoque&quot; no item
                  já cadastrado em vez de criar um novo — senão os lembretes duplicam.
                </p>
              </div>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="button" onClick={() => void save()} disabled={saving || !draft.name.trim()}>
                {saving ? "Salvando…" : similar.length ? "Cadastrar mesmo assim" : "Confirmar e cadastrar"}
              </Button>
              {similar.length ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setDraft(null);
                    setSimilar([]);
                    setLimitations(null);
                    clear();
                  }}
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
    </div>
  );
}
