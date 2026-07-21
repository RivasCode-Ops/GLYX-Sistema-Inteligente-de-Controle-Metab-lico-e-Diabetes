import type { MuscleGroupId } from "@/lib/data/muscle-groups";
import {
  byPriority,
  isAvailable,
  limitAvailableByTime,
  type MuscleRecoveryStatus,
  type TimeBudgetMinutes,
} from "@/lib/exercicios/muscle-recovery";

export type TrainingDayId =
  | "inferior-a"
  | "superior-a"
  | "inferior-b"
  | "superior-b"
  | "full-body"
  | "descanso";

export type TrainingDay = {
  id: TrainingDayId;
  label: string;
  focus: string;
  groups: MuscleGroupId[];
};

/**
 * Padrão de carga do plano — igual para todos os dias de força. Não é
 * prescrição individual: veio do plano montado para o usuário e deve ser
 * revisado com médico/educador físico antes de iniciar.
 */
export const LOAD_PATTERN = {
  intensity: "70-80% de 1RM",
  effort: "RIR 1-2 (parar 1-2 reps antes da falha)",
  rest: "60-90s entre séries",
  sessionMinutes: 50,
  progression: "Suba a carga quando fechar o topo da faixa de repetições com a técnica limpa.",
} as const;

const DESCANSO: TrainingDay = {
  id: "descanso",
  label: "Descanso",
  focus: "Recuperação — o ganho acontece fora da academia.",
  groups: [],
};

/**
 * Divisão de 5 dias (segunda a sexta), ordenada para que grupos grandes
 * treinem 2x/semana com folga entre si e abdômen/panturrilha/antebraço
 * apareçam com frequência maior, já que recuperam mais rápido.
 *
 * Indexado por `Date.getDay()` — 0 = domingo.
 */
export const WEEKDAY_PLAN: Record<number, TrainingDay> = {
  0: DESCANSO,
  1: {
    id: "inferior-a",
    label: "Inferior A",
    focus: "Quadríceps e panturrilha",
    groups: ["quadriceps", "panturrilhas", "abdomen"],
  },
  2: {
    id: "superior-a",
    label: "Superior A",
    focus: "Peito, ombro e tríceps",
    groups: ["peito", "ombros", "triceps", "abdomen"],
  },
  3: {
    id: "inferior-b",
    label: "Inferior B",
    focus: "Posterior de coxa e panturrilha",
    groups: ["posterior", "panturrilhas", "abdomen"],
  },
  4: {
    id: "superior-b",
    label: "Superior B",
    focus: "Costas e bíceps",
    groups: ["costas", "biceps", "antebracos"],
  },
  5: {
    id: "full-body",
    label: "Full body leve + braços",
    focus: "Volume leve de corpo inteiro com ênfase em braços",
    groups: ["biceps", "triceps", "antebracos", "abdomen"],
  },
  6: DESCANSO,
};

export function getTrainingDay(date: Date = new Date()): TrainingDay {
  return WEEKDAY_PLAN[date.getDay()] ?? DESCANSO;
}

/** Dias de treino na ordem da semana (segunda a sexta), para exibir o plano inteiro. */
export function getWeekPlan(): { weekday: number; day: TrainingDay }[] {
  return [1, 2, 3, 4, 5].map((weekday) => ({ weekday, day: WEEKDAY_PLAN[weekday] }));
}

export type PlanSuggestion = {
  /** O treino que o calendário do plano pedia para hoje. */
  scheduled: TrainingDay;
  /** O treino que a recuperação permite de fato — pode ser outro dia do plano. */
  suggested: TrainingDay;
  /** true quando a recuperação obrigou a trocar o dia agendado. */
  swapped: boolean;
  /** Grupos a treinar hoje, já limitados pelo tempo de sessão. */
  included: MuscleRecoveryStatus[];
  /** Disponíveis, mas fora do tempo da sessão. */
  deferred: MuscleRecoveryStatus[];
  /** Grupos do treino sugerido ainda descansando ou pausados. */
  resting: MuscleRecoveryStatus[];
  reason: string;
};

/**
 * Resumo curto do plano pra linha de Exercícios do dashboard — o espaço é de
 * uma métrica, então cabe só o essencial: qual treino é hoje e se a
 * recuperação mudou alguma coisa.
 */
export function planSummaryLabel(suggestion: PlanSuggestion): string {
  if (suggestion.suggested.id === "descanso") return "Descanso";
  if (!suggestion.included.length) return "Tudo em recuperação";
  if (suggestion.swapped) return `Antecipe: ${suggestion.suggested.label}`;
  return `Hoje: ${suggestion.suggested.label}`;
}

function availabilityScore(available: MuscleRecoveryStatus[]): number {
  return available.reduce(
    (sum, s) => sum + (s.status === "never" ? 1000 : (s.hoursReady ?? 0)) + 1,
    0
  );
}

function splitByAvailability(day: TrainingDay, byId: Map<MuscleGroupId, MuscleRecoveryStatus>) {
  const dayStatuses = day.groups
    .map((id) => byId.get(id))
    .filter((s): s is MuscleRecoveryStatus => !!s);
  return {
    available: dayStatuses.filter(isAvailable).sort(byPriority),
    resting: dayStatuses.filter((s) => !isAvailable(s)),
  };
}

/**
 * Decide o treino de hoje pelo mesmo critério que o resto do app: o calendário
 * do plano é a intenção, a recuperação registrada é o que manda. Quando o dia
 * agendado está saturado (todos os grupos ainda descansando), troca para o dia
 * do plano com maior atraso acumulado em vez de mandar treinar em cima de
 * músculo que não recuperou — mesma lógica de prioridade de `suggestMuscleSplit`.
 */
export function suggestFromPlan(
  statuses: MuscleRecoveryStatus[],
  today: Date = new Date(),
  minutes: TimeBudgetMinutes = 60
): PlanSuggestion {
  const byId = new Map(statuses.map((s) => [s.id, s]));
  const scheduled = getTrainingDay(today);

  if (scheduled.id === "descanso") {
    return {
      scheduled,
      suggested: scheduled,
      swapped: false,
      included: [],
      deferred: [],
      resting: [],
      reason: "Dia de descanso no plano — recuperação faz parte do treino.",
    };
  }

  const own = splitByAvailability(scheduled, byId);
  if (own.available.length) {
    const { included, deferred } = limitAvailableByTime(own.available, minutes);
    return {
      scheduled,
      suggested: scheduled,
      swapped: false,
      included,
      deferred,
      resting: own.resting,
      reason: own.resting.length
        ? `${own.resting.map((r) => r.label).join(", ")} ainda descansando — treine o resto do dia.`
        : "Todos os grupos de hoje estão recuperados.",
    };
  }

  const alternatives = getWeekPlan()
    .filter(({ day }) => day.id !== scheduled.id)
    .map(({ day }) => ({ day, ...splitByAvailability(day, byId) }))
    .filter((c) => c.available.length > 0)
    .sort((a, b) => availabilityScore(b.available) - availabilityScore(a.available));

  if (!alternatives.length) {
    return {
      scheduled,
      suggested: scheduled,
      swapped: false,
      included: [],
      deferred: [],
      resting: own.resting,
      reason: "Nenhum grupo recuperado hoje — descanse ou faça uma sessão leve de aeróbico.",
    };
  }

  const best = alternatives[0];
  const { included, deferred } = limitAvailableByTime(best.available, minutes);
  return {
    scheduled,
    suggested: best.day,
    swapped: true,
    included,
    deferred,
    resting: best.resting,
    reason: `${scheduled.label} ainda está em recuperação — antecipe ${best.day.label}.`,
  };
}
