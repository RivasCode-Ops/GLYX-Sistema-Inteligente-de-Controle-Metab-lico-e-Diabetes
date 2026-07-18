"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { logStrengthSet, deleteStrengthLog } from "@/app/actions/strength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import type { StrengthLog } from "@/lib/queries/strength";

export function StrengthLogForm({ logs }: { logs: StrengthLog[] }) {
  const router = useRouter();
  const toast = useToast();
  const [exerciseName, setExerciseName] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState("3");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exerciseNames = useMemo(
    () => [...new Set(logs.map((l) => l.exercise_name))].sort(),
    [logs]
  );

  const lastForExercise = useMemo(() => {
    const q = exerciseName.trim().toLowerCase();
    if (!q) return null;
    return logs.find((l) => l.exercise_name.toLowerCase() === q) ?? null;
  }, [exerciseName, logs]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!exerciseName.trim() || !reps) {
      setError("Preencha o exercício e as repetições.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("exercise_name", exerciseName.trim());
      if (weight) fd.set("weight_kg", weight);
      fd.set("reps", reps);
      fd.set("sets", sets || "1");
      const res = await logStrengthSet(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast("Carga registrada.");
      setWeight("");
      setReps("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    await deleteStrengthLog(fd);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => void submit(e)} className="space-y-2">
        <datalist id="strength-exercise-names">
          {exerciseNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="grid gap-1">
          <Label htmlFor="exercise_name">Exercício</Label>
          <Input
            id="exercise_name"
            list="strength-exercise-names"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="ex.: Supino reto"
          />
        </div>
        {lastForExercise ? (
          <p className="text-[11px] text-zinc-500">
            Última vez: {lastForExercise.weight_kg != null ? `${lastForExercise.weight_kg} kg × ` : ""}
            {lastForExercise.reps} reps × {lastForExercise.sets} séries (
            {new Date(lastForExercise.logged_at).toLocaleDateString("pt-BR")})
          </p>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <div className="grid gap-1">
            <Label htmlFor="weight_kg">Carga (kg)</Label>
            <Input
              id="weight_kg"
              type="number"
              min={0}
              step="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="opcional"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="reps">Reps</Label>
            <Input
              id="reps"
              type="number"
              min={1}
              max={100}
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sets">Séries</Label>
            <Input
              id="sets"
              type="number"
              min={1}
              max={20}
              value={sets}
              onChange={(e) => setSets(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Salvando…" : "Registrar carga"}
        </Button>
        {error ? <p className="text-xs text-amber-300">{error}</p> : null}
      </form>

      {logs.length ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Últimos registros</p>
          <ul className="space-y-1.5">
            {logs.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                <span className="truncate">
                  {l.exercise_name} — {l.weight_kg != null ? `${l.weight_kg} kg × ` : ""}
                  {l.reps} × {l.sets}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-zinc-500">
                    {new Date(l.logged_at).toLocaleDateString("pt-BR")}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(l.id)}
                    aria-label={`Excluir registro de ${l.exercise_name}`}
                    title="Excluir"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-600 transition hover:bg-red-950/50 hover:text-red-300"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
