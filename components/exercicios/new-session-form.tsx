"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addExerciseSession } from "@/app/actions/exercise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";

export function NewSessionForm() {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setSaving(true);
    setError(null);
    try {
      const res = await addExerciseSession(new FormData(form));
      if (res.error) {
        setError(res.error);
        return;
      }
      toast("Sessão salva.");
      form.reset();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="label">Atividade</Label>
        <Input id="label" name="label" required placeholder="ex.: Caminhada leve" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="duration_min">Duração (min)</Label>
        <Input id="duration_min" name="duration_min" type="number" min={1} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="calories_burned">Calorias (est.)</Label>
        <Input id="calories_burned" name="calories_burned" type="number" min={0} />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="intensity">Intensidade</Label>
        <Input id="intensity" name="intensity" placeholder="leve / moderada / forte" />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="started_at_local">Horário real do treino</Label>
        <Input id="started_at_local" name="started_at_local" type="datetime-local" />
        <p className="text-[11px] text-zinc-600">Deixe em branco para usar o horário de agora.</p>
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="notes">Notas / contexto glicêmico (opcional)</Label>
        <Input id="notes" name="notes" placeholder="ex.: glicemia antes 140, depois 110" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar sessão"}
        </Button>
      </div>
      {error ? <p className="text-xs text-amber-300 sm:col-span-2">{error}</p> : null}
    </form>
  );
}
