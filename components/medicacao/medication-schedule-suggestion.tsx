"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateMedication } from "@/app/actions/medications";
import type { Medication } from "@/types/database";

type Suggestion = { id: string; time: string; rationale: string };

type Props = { medications: Medication[] };

/** Sugere horário só pros itens sem alarme (nunca reorganiza um horário já
 * fixo) — remédio tratado como prioridade sobre suplemento na distribuição. */
export function MedicationScheduleSuggestion({ medications }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unscheduled = useMemo(
    () => medications.filter((m) => !m.reminder_times?.length),
    [medications]
  );
  const scheduledContext = useMemo(
    () =>
      medications
        .filter((m) => m.reminder_times?.length)
        .map((m) => ({ name: m.name, kind: m.kind ?? "med", times: m.reminder_times! })),
    [medications]
  );

  if (!unscheduled.length) return null;

  async function askSuggestions() {
    setPending(true);
    setError(null);
    setSuggestions(null);
    try {
      const res = await fetch("/api/ai/medication-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unscheduled: unscheduled.map((m) => ({
            id: m.id,
            name: m.name,
            kind: m.kind ?? "med",
            dosage: m.dosage,
            scheduleHint: m.schedule_hint,
          })),
          scheduled: scheduledContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao pedir sugestão.");
        return;
      }
      setSuggestions(data.suggestions ?? []);
    } catch {
      setError("Erro de rede.");
    } finally {
      setPending(false);
    }
  }

  async function applyAll() {
    if (!suggestions?.length) return;
    setApplying(true);
    try {
      for (const s of suggestions) {
        const med = unscheduled.find((m) => m.id === s.id);
        if (!med) continue;
        const fd = new FormData();
        fd.set("medication_id", med.id);
        fd.set("name", med.name);
        if (med.dosage) fd.set("dosage", med.dosage);
        if (med.schedule_hint) fd.set("schedule_hint", med.schedule_hint);
        fd.set("kind", med.kind ?? "med");
        fd.set("reminder_times", s.time);
        await updateMedication(fd);
      }
      setSuggestions(null);
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Organizar horários com IA</CardTitle>
        <CardDescription>
          Sem alarme ainda: {unscheduled.map((m) => m.name).join(", ")}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" variant="outline" disabled={pending} onClick={() => void askSuggestions()}>
          {pending ? "Pensando…" : "✨ Sugerir horários com IA"}
        </Button>
        {error ? <p className="text-xs text-amber-300">{error}</p> : null}
        {suggestions && suggestions.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-3">
            {suggestions.map((s) => {
              const med = unscheduled.find((m) => m.id === s.id);
              return (
                <div key={s.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="text-zinc-100">{med?.name ?? s.id}</p>
                    <p className="text-xs text-zinc-500">{s.rationale}</p>
                  </div>
                  <span className="font-mono text-sm text-emerald-300">{s.time}</span>
                </div>
              );
            })}
            <Button type="button" size="sm" disabled={applying} onClick={() => void applyAll()}>
              {applying ? "Aplicando…" : "Aplicar horários sugeridos"}
            </Button>
          </div>
        ) : null}
        <p className="text-[11px] leading-4 text-zinc-600">
          Organização de rotina — não é orientação médica. Remédio com horário clínico definido
          continua seguindo a prescrição, nunca a IA.
        </p>
      </CardContent>
    </Card>
  );
}
