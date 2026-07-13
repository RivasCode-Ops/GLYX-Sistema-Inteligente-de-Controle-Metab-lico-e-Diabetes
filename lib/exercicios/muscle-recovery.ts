import { MUSCLE_GROUPS, type MuscleGroupId } from "@/lib/data/muscle-groups";

export type MuscleRecoveryStatus = {
  id: MuscleGroupId;
  label: string;
  lastTrainedAt: string | null;
  status: "never" | "recovering" | "ready";
  /** Horas até o grupo estar pronto de novo (só quando status = "recovering"). */
  hoursRemaining: number | null;
  /** Há quanto tempo o grupo está pronto e ainda não foi treinado de novo (só quando status = "ready"). */
  hoursReady: number | null;
};

/** Deriva o status de recuperação de cada grupo a partir do último treino registrado (ou nenhum). */
export function computeMuscleRecovery(
  lastTrainedByGroup: Partial<Record<MuscleGroupId, string>>,
  now: Date = new Date()
): MuscleRecoveryStatus[] {
  return MUSCLE_GROUPS.map((group) => {
    const last = lastTrainedByGroup[group.id];
    if (!last) {
      return {
        id: group.id,
        label: group.label,
        lastTrainedAt: null,
        status: "never",
        hoursRemaining: null,
        hoursReady: null,
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
      };
    }

    return {
      id: group.id,
      label: group.label,
      lastTrainedAt: last,
      status: "ready",
      hoursRemaining: null,
      hoursReady: Math.floor(hoursSince - group.recoveryHours),
    };
  });
}

/** Sugestão de foco do dia: nunca treinado primeiro, senão o grupo pronto há mais tempo. */
export function suggestMuscleFocus(statuses: MuscleRecoveryStatus[]): MuscleRecoveryStatus | null {
  const never = statuses.find((s) => s.status === "never");
  if (never) return never;

  const ready = statuses.filter((s) => s.status === "ready");
  if (!ready.length) return null;

  return ready.reduce((longest, current) =>
    (current.hoursReady ?? 0) > (longest.hoursReady ?? 0) ? current : longest
  );
}
