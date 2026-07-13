"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logMuscleTraining } from "@/app/actions/exercise";
import { MUSCLE_GROUPS } from "@/lib/data/muscle-groups";
import type { MuscleRecoveryStatus } from "@/lib/exercicios/muscle-recovery";

const RECOVERY_HOURS = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.id, g.recoveryHours]));

const STATUS_STROKE: Record<MuscleRecoveryStatus["status"], string> = {
  never: "#3f3f46",
  recovering: "#fbbf24",
  ready: "#10b981",
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
  if (s.status === "never") return { text: "Sem registro ainda", className: "text-zinc-500" };
  if (s.status === "recovering")
    return { text: `Descanso — faltam ${s.hoursRemaining}h`, className: "text-amber-400" };
  const days = Math.floor((s.hoursReady ?? 0) / 24);
  const label = days >= 1 ? `Pronto há ${days} dia${days > 1 ? "s" : ""}` : `Pronto há ${s.hoursReady}h`;
  return { text: label, className: "text-emerald-400" };
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

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function register() {
    if (!selected.length) return;
    startTransition(async () => {
      const res = await logMuscleTraining(selected);
      setStatus(res.error ?? "Treino registrado.");
      if (!res.error) {
        setSelected([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {suggestion ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-800/60 bg-emerald-950/40 px-3.5 py-3">
          <Lightbulb className="h-[18px] w-[18px] shrink-0 text-emerald-400" aria-hidden />
          <p className="text-[13px] leading-snug text-emerald-100">
            Sugestão de hoje: <strong className="font-medium">{suggestion.label}</strong>
            {suggestion.status === "never"
              ? " — ainda sem registro."
              : ` — pronto${suggestion.hoursReady && suggestion.hoursReady >= 24 ? ` há ${Math.floor(suggestion.hoursReady / 24)} dia(s)` : ""}, é o que mais espera.`}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {statuses.map((s) => {
          const meta = statusText(s);
          const totalHours = RECOVERY_HOURS[s.id] ?? 1;
          const fraction =
            s.status === "recovering"
              ? Math.max(0, Math.min(1, 1 - (s.hoursRemaining ?? 0) / totalHours))
              : 1;
          return (
            <Card key={s.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <StatusRing status={s.status} fraction={fraction} />
                <div className="flex-1">
                  <p className="text-sm text-zinc-200">{s.label}</p>
                  <p className={`text-xs ${meta.className}`}>{meta.text}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
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
