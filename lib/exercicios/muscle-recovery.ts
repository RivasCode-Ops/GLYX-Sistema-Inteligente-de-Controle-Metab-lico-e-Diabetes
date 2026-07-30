import {
  MIN_LOGS_FOR_ESTABLISHED_HISTORY,
  MUSCLE_GROUPS,
  type MuscleGroupId,
} from "@/lib/data/muscle-groups";

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
  /** Registros próprios suficientes para o app afirmar algo sobre o grupo. */
  establishedHistory: boolean;
  /**
   * Se este "nunca treinado" vale prioridade máxima.
   *
   * `status === "never"` sozinho não serve mais para priorizar: trapézio e
   * glúteos entraram no modelo sem histórico, e sem esta distinção o app mandaria
   * treiná-los na frente de tudo no dia seguinte à ponte — sendo que já são
   * treinados, só que registrados sob outro grupo.
   *
   * A decisão depende do conjunto, por isso é resolvida aqui, onde o conjunto
   * existe, e não em `byPriority`, que só enxerga dois elementos por vez.
   */
  prioritizeAsNever: boolean;
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
  now: Date = new Date(),
  /**
   * Quantas vezes cada grupo já foi registrado em nome próprio. Tem que vir da
   * **mesma fonte** de `lastTrainedByGroup` — uma guarda alimentada por outra
   * tabela fica inerte e ainda parece instalada.
   */
  historyCountByGroup: Partial<Record<MuscleGroupId, number>> = {}
): MuscleRecoveryStatus[] {
  const established = (id: MuscleGroupId) =>
    (historyCountByGroup[id] ?? 0) >= MIN_LOGS_FOR_ESTABLISHED_HISTORY;

  /*
   * Sem nenhum grupo com histórico próprio, quem usa o app é novo — e aí "nunca
   * treinado" é a verdade, não ruído de modelo. Rebaixar todo mundo nesse caso
   * deixaria a tela sem sugestão alguma logo no primeiro acesso, que é pior que o
   * falso positivo que a guarda existe para evitar.
   */
  const anyEstablished = MUSCLE_GROUPS.some((g) => established(g.id));

  return MUSCLE_GROUPS.map((group) => {
    const last = lastTrainedByGroup[group.id] ?? null;
    const establishedHistory = established(group.id);
    const base = {
      id: group.id,
      label: group.label,
      establishedHistory,
      prioritizeAsNever: false,
    };

    if (group.id in pausedGroups) {
      return {
        ...base,
        lastTrainedAt: last,
        status: "paused" as const,
        hoursRemaining: null,
        hoursReady: null,
        pauseReason: pausedGroups[group.id] ?? null,
      };
    }

    if (!last) {
      return {
        ...base,
        lastTrainedAt: null,
        status: "never" as const,
        hoursRemaining: null,
        hoursReady: null,
        pauseReason: null,
        prioritizeAsNever: establishedHistory || !anyEstablished,
      };
    }

    const hoursSince = (now.getTime() - new Date(last).getTime()) / 3_600_000;
    if (hoursSince < group.recoveryHours) {
      return {
        ...base,
        lastTrainedAt: last,
        status: "recovering" as const,
        hoursRemaining: Math.ceil(group.recoveryHours - hoursSince),
        hoursReady: null,
        pauseReason: null,
      };
    }

    return {
      ...base,
      lastTrainedAt: last,
      status: "ready" as const,
      hoursRemaining: null,
      hoursReady: Math.floor(hoursSince - group.recoveryHours),
      pauseReason: null,
    };
  });
}

/** Sugestão de foco do dia: nunca treinado primeiro, senão o grupo pronto há mais tempo (pausados nunca entram). */
export function suggestMuscleFocus(statuses: MuscleRecoveryStatus[]): MuscleRecoveryStatus | null {
  const never = statuses.find((s) => s.prioritizeAsNever);
  if (never) return never;

  const ready = statuses.filter((s) => s.status === "ready");
  if (!ready.length) return null;

  return ready.reduce((longest, current) =>
    (current.hoursReady ?? 0) > (longest.hoursReady ?? 0) ? current : longest
  );
}

export function isAvailable(s: MuscleRecoveryStatus): boolean {
  return s.status === "ready" || s.status === "never";
}

/** Nunca-treinado primeiro, depois quem está pronto há mais tempo — mesmo
 * critério de `suggestMuscleFocus`, usado aqui pra ordenar `available` para
 * que "pegar os N primeiros" (filtro de tempo) sempre priorize quem está
 * mais atrasado, não a ordem arbitrária de cadastro do grupo. */
export function byPriority(a: MuscleRecoveryStatus, b: MuscleRecoveryStatus): number {
  if (a.prioritizeAsNever && !b.prioritizeAsNever) return -1;
  if (b.prioritizeAsNever && !a.prioritizeAsNever) return 1;
  return (b.hoursReady ?? 0) - (a.hoursReady ?? 0);
}

export type MuscleSplitId = "push" | "pull" | "pernas";

export type MuscleSplitDef = { id: MuscleSplitId; label: string; groups: MuscleGroupId[] };

/**
 * Divisão clássica de treino (push/pull/pernas) — agrupa músculos que fazem
 * sentido no mesmo **dia**.
 *
 * Isto é nível de dia, não de série. A tabela de pares a evitar (peito↔tríceps,
 * costas↔bíceps) é nível de **superset** e vive em outro lugar de propósito:
 * push juntar peito, ombros e tríceps é correto, e o tríceps entrar já fatigado
 * depois das pressões é intencional. Renderizar os dois no mesmo componente faz
 * a tela se contradizer sozinha.
 *
 * Trapézio entra no push por ser o dia de ombros na ficha, não por afinidade
 * anatômica com peito.
 */
export const MUSCLE_SPLITS: MuscleSplitDef[] = [
  { id: "push", label: "Push (empurrar)", groups: ["peito", "ombros", "triceps", "trapezio"] },
  { id: "pull", label: "Pull (puxar)", groups: ["costas", "biceps", "antebracos"] },
  {
    id: "pernas",
    label: "Pernas",
    groups: ["quadriceps", "posterior", "gluteos", "panturrilhas", "abdomen"],
  },
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
      (sum, s) => sum + (s.prioritizeAsNever ? 1000 : (s.hoursReady ?? 0)) + 1,
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
