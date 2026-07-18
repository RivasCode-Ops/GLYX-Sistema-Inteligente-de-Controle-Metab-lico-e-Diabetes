import { MUSCLE_GROUPS, type MuscleGroupId } from "@/lib/data/muscle-groups";

export type MuscleRecoveryStatus = {
  id: MuscleGroupId;
  label: string;
  lastTrainedAt: string | null;
  status: "never" | "recovering" | "ready" | "paused";
  /** Horas até o grupo estar pronto de novo (só quando status = "recovering"). */
  hoursRemaining: number | null;
  /** Há quanto tempo o grupo está pronto e ainda não foi treinado de novo (só quando status = "ready"). */
  hoursReady: number | null;
  /** Motivo da pausa manual (só quando status = "paused"). */
  pauseReason: string | null;
};

/**
 * Deriva o status de recuperação de cada grupo a partir do último treino
 * registrado e de pausas manuais ativas. Pausa manual sempre vence o
 * cronômetro — motivo real (dor, falta de tempo, lesão leve) não segue
 * uma janela fixa de horas.
 */
export function computeMuscleRecovery(
  lastTrainedByGroup: Partial<Record<MuscleGroupId, string>>,
  pausedGroups: Partial<Record<MuscleGroupId, string | null>> = {},
  now: Date = new Date()
): MuscleRecoveryStatus[] {
  return MUSCLE_GROUPS.map((group) => {
    const last = lastTrainedByGroup[group.id] ?? null;

    if (group.id in pausedGroups) {
      return {
        id: group.id,
        label: group.label,
        lastTrainedAt: last,
        status: "paused",
        hoursRemaining: null,
        hoursReady: null,
        pauseReason: pausedGroups[group.id] ?? null,
      };
    }

    if (!last) {
      return {
        id: group.id,
        label: group.label,
        lastTrainedAt: null,
        status: "never",
        hoursRemaining: null,
        hoursReady: null,
        pauseReason: null,
      };
    }

    const hoursSince = (now.getTime() - new Date(last).getTime()) / 3_600_000;
    if (hoursSince < group.recoveryHours) {
      return {
        id: group.id,
        label: group.label,
        lastTrainedAt: last,
        status: "recovering",
        hoursRemaining: Math.ceil(group.recoveryHours - hoursSince),
        hoursReady: null,
        pauseReason: null,
      };
    }

    return {
      id: group.id,
      label: group.label,
      lastTrainedAt: last,
      status: "ready",
      hoursRemaining: null,
      hoursReady: Math.floor(hoursSince - group.recoveryHours),
      pauseReason: null,
    };
  });
}

/** Sugestão de foco do dia: nunca treinado primeiro, senão o grupo pronto há mais tempo (pausados nunca entram). */
export function suggestMuscleFocus(statuses: MuscleRecoveryStatus[]): MuscleRecoveryStatus | null {
  const never = statuses.find((s) => s.status === "never");
  if (never) return never;

  const ready = statuses.filter((s) => s.status === "ready");
  if (!ready.length) return null;

  return ready.reduce((longest, current) =>
    (current.hoursReady ?? 0) > (longest.hoursReady ?? 0) ? current : longest
  );
}

function isAvailable(s: MuscleRecoveryStatus): boolean {
  return s.status === "ready" || s.status === "never";
}

/** Nunca-treinado primeiro, depois quem está pronto há mais tempo — mesmo
 * critério de `suggestMuscleFocus`, usado aqui pra ordenar `available` para
 * que "pegar os N primeiros" (filtro de tempo) sempre priorize quem está
 * mais atrasado, não a ordem arbitrária de cadastro do grupo. */
function byPriority(a: MuscleRecoveryStatus, b: MuscleRecoveryStatus): number {
  if (a.status === "never" && b.status !== "never") return -1;
  if (b.status === "never" && a.status !== "never") return 1;
  return (b.hoursReady ?? 0) - (a.hoursReady ?? 0);
}

export type MuscleSplitId = "push" | "pull" | "pernas";

export type MuscleSplitDef = { id: MuscleSplitId; label: string; groups: MuscleGroupId[] };

/** Divisão clássica de treino (push/pull/pernas) — agrupa músculos que fazem sentido no mesmo dia. */
export const MUSCLE_SPLITS: MuscleSplitDef[] = [
  { id: "push", label: "Push (empurrar)", groups: ["peito", "ombros", "triceps"] },
  { id: "pull", label: "Pull (puxar)", groups: ["costas", "biceps", "antebracos"] },
  { id: "pernas", label: "Pernas", groups: ["pernas", "panturrilhas", "abdomen"] },
];

export type MuscleSplitSuggestion = {
  split: MuscleSplitDef;
  /** Músculos desse dia que dá pra treinar agora (no mínimo 1) — pronto ou nunca treinado. */
  available: MuscleRecoveryStatus[];
  /** Músculos desse dia que ainda estão descansando ou pausados. */
  resting: MuscleRecoveryStatus[];
};

/**
 * Sugere qual dia da divisão (push/pull/pernas) treinar hoje e quais dos
 * músculos desse dia já dá pra malhar — pode ser 1, 2 ou todos, conforme a
 * recuperação de cada um. Prioriza o dia com mais músculos disponíveis e
 * com o atraso acumulado maior (nunca treinado conta mais que só atrasado).
 */
export function suggestMuscleSplit(statuses: MuscleRecoveryStatus[]): MuscleSplitSuggestion | null {
  const byId = new Map(statuses.map((s) => [s.id, s]));

  const candidates = MUSCLE_SPLITS.map((split) => {
    const groupStatuses = split.groups.map((id) => byId.get(id)).filter((s): s is MuscleRecoveryStatus => !!s);
    const available = groupStatuses.filter(isAvailable).sort(byPriority);
    const resting = groupStatuses.filter((s) => !isAvailable(s));
    const score = available.reduce(
      (sum, s) => sum + (s.status === "never" ? 1000 : (s.hoursReady ?? 0)) + 1,
      0
    );
    return { split, available, resting, score };
  }).filter((c) => c.available.length > 0);

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  const { split, available, resting } = candidates[0];
  return { split, available, resting };
}

export type TimeBudgetMinutes = 30 | 60 | 90;

export const TIME_BUDGETS: TimeBudgetMinutes[] = [30, 60, 90];

/** Quantos grupos musculares cabem no tempo escolhido — 30min só dá pra um
 * grupo bem feito, 90min cabe o split inteiro. `available` já vem priorizado
 * (mais atrasado primeiro), então "pegar os N primeiros" nunca deixa de fora
 * quem mais precisa. Sem isso, com tudo recuperado (ex.: depois de uma
 * pausa longa) o treino sugerido vira o split inteiro mesmo sem tempo pra
 * cumprir, e o usuário some do app em vez de fazer uma versão menor. */
export function limitAvailableByTime(
  available: MuscleRecoveryStatus[],
  minutes: TimeBudgetMinutes
): { included: MuscleRecoveryStatus[]; deferred: MuscleRecoveryStatus[] } {
  const cap = minutes === 30 ? 1 : minutes === 60 ? 2 : available.length;
  return { included: available.slice(0, cap), deferred: available.slice(cap) };
}
