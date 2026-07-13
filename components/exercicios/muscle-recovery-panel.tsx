"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logMuscleTraining, pauseMuscleGroup, resumeMuscleGroup } from "@/app/actions/exercise";
import { MUSCLE_GROUPS } from "@/lib/data/muscle-groups";
import { suggestMuscleSplit, type MuscleRecoveryStatus } from "@/lib/exercicios/muscle-recovery";

const RECOVERY_HOURS = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.id, g.recoveryHours]));

type TrainingType = "forca" | "resistencia";

const SCHEME: Record<TrainingType, { label: string; sets: string; rest: string }> = {
  forca: { label: "Força", sets: "4 séries × 4-6 reps", rest: "Descanso 120s" },
  resistencia: { label: "Resistência", sets: "3 séries × 15-20 reps", rest: "Descanso 45s" },
};

const STATUS_STROKE: Record<MuscleRecoveryStatus["status"], string> = {
  never: "#3f3f46",
  recovering: "#fbbf24",
  ready: "#10b981",
  paused: "#f87171",
};

function StatusRing({ status, fraction }: { status: MuscleRecoveryStatus["status"]; fraction: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const offset = status === "never" ? c : c * (1 - fraction);
  return (
    <svg viewBox="0 0 36 36" className="h-[34px] w-[34px] shrink-0" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#27272a" strokeWidth={5} />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke={STATUS_STROKE[status]}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

function statusText(s: MuscleRecoveryStatus): { text: string; className: string } {
  if (s.status === "paused")
    return { text: s.pauseReason ? `Pausado — ${s.pauseReason}` : "Pausado", className: "text-red-400" };
  if (s.status === "never") return { text: "Sem registro ainda", className: "text-zinc-500" };
  if (s.status === "recovering")
    return { text: `Descanso — faltam ${s.hoursRemaining}h`, className: "text-amber-400" };
  const days = Math.floor((s.hoursReady ?? 0) / 24);
  const label = days >= 1 ? `Pronto há ${days} dia${days > 1 ? "s" : ""}` : `Pronto há ${s.hoursReady}h`;
  return { text: label, className: "text-emerald-400" };
}

function StatusRow({ status }: { status: MuscleRecoveryStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pausing, setPausing] = useState(false);
  const [reason, setReason] = useState("");
  const meta = statusText(status);
  const totalHours = RECOVERY_HOURS[status.id] ?? 1;
  const fraction =
    status.status === "recovering"
      ? Math.max(0, Math.min(1, 1 - (status.hoursRemaining ?? 0) / totalHours))
      : 1;

  function confirmPause() {
    startTransition(async () => {
      await pauseMuscleGroup(status.id, reason);
      setPausing(false);
      setReason("");
      router.refresh();
    });
  }

  function resume() {
    startTransition(async () => {
      await resumeMuscleGroup(status.id);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <StatusRing status={status.status} fraction={fraction} />
          <div className="flex-1">
            <p className="text-sm text-zinc-200">{status.label}</p>
            <p className={`text-xs ${meta.className}`}>{meta.text}</p>
          </div>
          {status.status === "paused" ? (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={resume}>
              Retomar
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setPausing((v) => !v)}>
              Não consigo
            </Button>
          )}
        </div>
        {pausing ? (
          <div className="mt-2 flex items-center gap-2 border-t border-zinc-800 pt-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo (opcional)"
              className="h-8 flex-1 text-xs"
            />
            <Button type="button" size="sm" disabled={pending} onClick={confirmPause}>
              Pausar
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type Props = {
  statuses: MuscleRecoveryStatus[];
  suggestion: MuscleRecoveryStatus | null;
};

export function MuscleRecoveryPanel({ statuses, suggestion }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [trainingType, setTrainingType] = useState<TrainingType>("forca");
  const [aiPending, setAiPending] = useState(false);
  const [aiResult, setAiResult] = useState<{ exercises: { muscle: string; name: string }[]; tip: string } | null>(
    null
  );
  const [aiError, setAiError] = useState<string | null>(null);

  const splitSuggestion = useMemo(() => suggestMuscleSplit(statuses), [statuses]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function register() {
    if (!selected.length) return;
    startTransition(async () => {
      const res = await logMuscleTraining(selected, trainingType);
      setStatus(res.error ?? "Treino registrado.");
      if (!res.error) {
        setSelected([]);
        router.refresh();
      }
    });
  }

  async function askAiSuggestion() {
    if (!splitSuggestion) return;
    setAiPending(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await fetch("/api/ai/workout-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          splitLabel: splitSuggestion.split.label,
          muscleLabels: splitSuggestion.available.map((s) => s.label),
          trainingType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "Falha ao pedir sugestão.");
        return;
      }
      setAiResult(data);
    } catch {
      setAiError("Erro de rede.");
    } finally {
      setAiPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {splitSuggestion ? (
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-emerald-400/80">
            {splitSuggestion.split.label} — pode malhar hoje
          </p>
          <p className="mt-1 text-base font-medium text-zinc-50">
            {splitSuggestion.available.map((s) => s.label).join(" + ")}
          </p>
          {splitSuggestion.resting.length ? (
            <p className="mt-1 text-xs text-zinc-500">
              Ainda descansando nesse dia: {splitSuggestion.resting.map((s) => s.label).join(", ")}
            </p>
          ) : null}
        </div>
      ) : suggestion ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-800/60 bg-emerald-950/40 px-3.5 py-3">
          <Lightbulb className="h-[18px] w-[18px] shrink-0 text-emerald-400" aria-hidden />
          <p className="text-[13px] leading-snug text-emerald-100">
            Sugestão de hoje: <strong className="font-medium">{suggestion.label}</strong>
          </p>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Tipo de treino hoje</p>
        <div className="flex gap-2">
          {(Object.keys(SCHEME) as TrainingType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrainingType(t)}
              className={
                trainingType === t
                  ? "flex-1 rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-medium text-emerald-950"
                  : "flex-1 rounded-lg border border-zinc-700 px-3 py-2.5 text-sm text-zinc-400"
              }
            >
              {SCHEME[t].label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500">
          <span>{SCHEME[trainingType].sets}</span>
          <span>{SCHEME[trainingType].rest}</span>
        </div>
      </div>

      {splitSuggestion ? (
        <div>
          <Button
            type="button"
            variant="subtle"
            className="w-full gap-2"
            disabled={aiPending}
            onClick={() => void askAiSuggestion()}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {aiPending ? "Pensando…" : "Pedir sugestão de exercícios à IA"}
          </Button>
          {aiError ? <p className="mt-2 text-xs text-amber-300">{aiError}</p> : null}
          {aiResult ? (
            <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Sugestão da IA</p>
              {aiResult.exercises.map((e, i) => (
                <p key={i} className="text-sm text-zinc-200">
                  <strong className="font-medium">{e.muscle}:</strong> {e.name}
                </p>
              ))}
              {aiResult.tip ? <p className="mt-2 text-xs text-zinc-500">{aiResult.tip}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {statuses.map((s) => (
          <StatusRow key={s.id} status={s} />
        ))}
      </div>

      <div className="border-t border-zinc-800 pt-4">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Malhei hoje — o quê?</p>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className={
                selected.includes(s.id)
                  ? "rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-emerald-950"
                  : "rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-600"
              }
            >
              {selected.includes(s.id) ? `✓ ${s.label}` : s.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          className="mt-3 w-full"
          disabled={!selected.length || pending}
          onClick={register}
        >
          {pending ? "Registrando…" : "Registrar treino de hoje"}
        </Button>
        {status ? <p className="mt-2 text-xs text-emerald-300">{status}</p> : null}
      </div>
    </div>
  );
}
