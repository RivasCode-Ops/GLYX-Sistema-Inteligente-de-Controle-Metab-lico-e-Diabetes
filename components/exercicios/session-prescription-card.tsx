import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { LOAD_PATTERN } from "@/lib/exercicios/training-plan";
import {
  totalSets,
  type GroupPrescription,
  type PrescriptionEmphasis,
} from "@/lib/exercicios/plan-prescription";
import type { ExerciseProgression } from "@/lib/exercicios/weekly-volume";

const EMPHASIS_PILL: Record<PrescriptionEmphasis, { tone: "emerald" | "amber" | "zinc"; label: string }> = {
  meta: { tone: "emerald", label: "meta" },
  deficit: { tone: "amber", label: "déficit" },
  reduzir: { tone: "amber", label: "reduzir" },
  manutencao: { tone: "zinc", label: "manutenção" },
};

/**
 * Quanto treinar hoje, por grupo — a ponte entre a meta corporal e a sessão.
 *
 * A conta aparece na tela (alvo semanal ÷ frequência do grupo no plano) porque
 * número de série sem origem visível é indistinguível de chute, e quem treina
 * precisa poder discordar com fundamento.
 */
export function SessionPrescriptionCard({
  prescriptions,
  progressions,
  uncovered,
}: {
  prescriptions: GroupPrescription[];
  progressions: ExerciseProgression[];
  uncovered: { id: string; label: string; goalLabel: string; setsPerWeek: number; minTarget: number }[];
}) {
  if (!prescriptions.length && !uncovered.length) return null;

  const stalled = progressions.filter((p) => !p.progressing && p.sessions >= 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quanto treinar hoje</CardTitle>
        <CardDescription>
          Séries derivadas do seu volume semanal atual e das metas de{" "}
          <Link href="/composicao/metas" className="underline">
            composição corporal
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {prescriptions.length ? (
          <>
            <div className="space-y-2">
              {prescriptions.map((p) => (
                <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-100">
                      {p.label}{" "}
                      <StatusPill tone={EMPHASIS_PILL[p.emphasis].tone}>
                        {EMPHASIS_PILL[p.emphasis].label}
                      </StatusPill>
                    </p>
                    <p className="whitespace-nowrap text-sm font-semibold text-sky-300">
                      {p.setsToday} séries
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500">{p.reason}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-zinc-400">
              Total de {totalSets(prescriptions)} séries · {LOAD_PATTERN.intensity} ·{" "}
              {LOAD_PATTERN.effort} · descanso {LOAD_PATTERN.rest}.
            </p>
          </>
        ) : null}

        {uncovered.length ? (
          <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3">
            <p className="text-xs font-medium text-amber-200">
              Metas sem volume suficiente em nenhum dia da semana
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-zinc-400">
              {uncovered.map((u) => (
                <li key={u.id}>
                  <strong>{u.label}</strong> — {u.setsPerWeek} séries/semana contra o piso de{" "}
                  {u.minTarget}, e sua meta de {u.goalLabel.toLowerCase()} depende desse grupo.
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {stalled.length ? (
          <div>
            <p className="text-xs font-medium text-zinc-300">Carga parada há algumas semanas</p>
            <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-zinc-500">
              {stalled.slice(0, 5).map((p) => (
                <li key={p.exercise}>
                  <strong className="text-zinc-400">{p.exercise}</strong> — 1RM estimado{" "}
                  {p.firstOneRm} → {p.lastOneRm} kg em {p.sessions} sessões.{" "}
                  {LOAD_PATTERN.progression}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-[11px] leading-snug text-zinc-500">
          Faixas de referência gerais de treino de força, não prescrição individual. Se você tem
          lesão, restrição cardíaca ou usa insulina, ajuste com profissional antes de subir volume.
        </p>
      </CardContent>
    </Card>
  );
}
