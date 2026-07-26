/**
 * Traduz meta corporal + volume semanal atual em **séries por grupo na sessão
 * de hoje**.
 *
 * Antes, o plano de treino olhava só recuperação muscular: dizia *o que*
 * treinar hoje, nunca *quanto*. E o módulo de composição sabia que o volume de
 * costas estava abaixo do necessário para a meta, mas isso morria como texto de
 * alerta. Este arquivo é a ponte: o déficit vira número de séries.
 *
 * A conta é deliberadamente simples e conferível pelo usuário:
 *
 *     séries hoje = alvo semanal do grupo ÷ vezes que o grupo aparece na semana
 *
 * O alvo é o piso da faixa de referência para manutenção, e o topo quando o
 * grupo sustenta uma meta de crescimento ainda não atingida. Nada aqui é
 * prescrição individual: é aritmética sobre uma faixa de referência geral, e a
 * tela diz isso.
 */

import type { MuscleGroupId } from "@/lib/data/muscle-groups";
import { WEEKDAY_PLAN } from "@/lib/exercicios/training-plan";
import type { GroupVolume } from "@/lib/exercicios/weekly-volume";
import type { GoalProgress } from "@/lib/body/goals";
import { MEASURE_TO_MUSCLE } from "@/lib/body/alerts";

/** Nenhuma sessão prescreve menos que isto para um grupo que vai ser treinado. */
const MIN_SETS_PER_SESSION = 2;
/**
 * Nem mais que isto: acima de ~8 séries no mesmo grupo numa sessão, as últimas
 * rendem pouco e comem o tempo do resto do treino. Déficit grande se resolve
 * com mais frequência na semana, não com uma sessão gigante.
 */
const MAX_SETS_PER_SESSION = 8;

export type PrescriptionEmphasis = "meta" | "deficit" | "manutencao" | "reduzir";

export type GroupPrescription = {
  id: MuscleGroupId;
  label: string;
  /** Quantas vezes o grupo aparece na semana do plano. */
  weeklySessions: number;
  /** Séries/semana já registradas na janela de volume. */
  currentSetsPerWeek: number;
  /** Alvo semanal escolhido para este grupo. */
  targetSetsPerWeek: number;
  /** Prescrição para a sessão de hoje. */
  setsToday: number;
  emphasis: PrescriptionEmphasis;
  reason: string;
  /** Meta corporal que depende deste grupo, quando existe. */
  goalLabel: string | null;
};

/** Quantas vezes cada grupo aparece na semana do plano de 5 dias. */
export function weeklySessionsByGroup(): Map<MuscleGroupId, number> {
  const counts = new Map<MuscleGroupId, number>();
  for (const day of Object.values(WEEKDAY_PLAN)) {
    for (const group of day.groups) {
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
  }
  return counts;
}

/** Metas de crescimento ainda não atingidas, mapeadas para os músculos que as sustentam. */
export function goalsByMuscle(goals: GoalProgress[]): Map<MuscleGroupId, GoalProgress> {
  const out = new Map<MuscleGroupId, GoalProgress>();
  for (const goal of goals) {
    if (goal.achieved || goal.direction !== "increase") continue;
    for (const muscle of MEASURE_TO_MUSCLE[goal.key] ?? []) {
      // Primeira meta vence: duas metas no mesmo músculo (braço direito e
      // esquerdo) não devem dobrar o volume prescrito.
      if (!out.has(muscle)) out.set(muscle, goal);
    }
  }
  return out;
}

function clampSets(value: number): number {
  return Math.max(MIN_SETS_PER_SESSION, Math.min(MAX_SETS_PER_SESSION, value));
}

/**
 * Prescrição para os grupos que vão ser treinados hoje.
 *
 * `trainedToday` são os grupos já filtrados por recuperação e tempo de sessão
 * (o que `suggestFromPlan` devolve em `included`) — a prescrição nunca ressuscita
 * um grupo que a recuperação vetou.
 */
export function prescribeForSession(
  trainedToday: { id: MuscleGroupId; label: string }[],
  volume: GroupVolume[],
  goals: GoalProgress[]
): GroupPrescription[] {
  const volumeById = new Map(volume.map((v) => [v.id, v]));
  const sessions = weeklySessionsByGroup();
  const goalMuscles = goalsByMuscle(goals);

  return trainedToday.map((group) => {
    const v = volumeById.get(group.id);
    const weeklySessions = Math.max(1, sessions.get(group.id) ?? 1);
    const goal = goalMuscles.get(group.id) ?? null;

    // Sem dado de volume (grupo fora da referência), cai no piso de 3 séries:
    // é melhor que não dizer nada, e a tela explica de onde veio.
    if (!v) {
      return {
        id: group.id,
        label: group.label,
        weeklySessions,
        currentSetsPerWeek: 0,
        targetSetsPerWeek: 0,
        setsToday: 3,
        emphasis: "manutencao" as const,
        reason: "Sem referência de volume para este grupo — comece por 3 séries e registre a carga.",
        goalLabel: goal?.label ?? null,
      };
    }

    const targetSetsPerWeek = goal ? v.optimalTarget : v.minTarget;
    const baseSets = clampSets(Math.ceil(targetSetsPerWeek / weeklySessions));

    if (v.status === "alto") {
      const reduced = clampSets(Math.floor(v.optimalTarget / weeklySessions));
      return {
        id: group.id,
        label: group.label,
        weeklySessions,
        currentSetsPerWeek: v.setsPerWeek,
        targetSetsPerWeek: v.optimalTarget,
        setsToday: reduced,
        emphasis: "reduzir" as const,
        reason: `${v.setsPerWeek} séries/semana registradas, bem acima da referência de ${v.optimalTarget}. Volume alto sem recuperação proporcional atrapalha mais do que ajuda.`,
        goalLabel: goal?.label ?? null,
      };
    }

    if (goal) {
      return {
        id: group.id,
        label: group.label,
        weeklySessions,
        currentSetsPerWeek: v.setsPerWeek,
        targetSetsPerWeek,
        setsToday: baseSets,
        emphasis: "meta" as const,
        reason: `Sustenta sua meta de ${goal.label.toLowerCase()} (faltam ${goal.remaining ?? "?"} ${goal.unit}). Alvo de ${targetSetsPerWeek} séries/semana em ${weeklySessions}x = ${baseSets} hoje; você está em ${v.setsPerWeek}/semana.`,
        goalLabel: goal.label,
      };
    }

    if (v.status === "insuficiente" || v.status === "sem_registro") {
      return {
        id: group.id,
        label: group.label,
        weeklySessions,
        currentSetsPerWeek: v.setsPerWeek,
        targetSetsPerWeek,
        setsToday: baseSets,
        emphasis: "deficit" as const,
        reason: `${v.setsPerWeek} séries/semana registradas, abaixo do piso de ${v.minTarget}.`,
        goalLabel: null,
      };
    }

    return {
      id: group.id,
      label: group.label,
      weeklySessions,
      currentSetsPerWeek: v.setsPerWeek,
      targetSetsPerWeek,
      setsToday: baseSets,
      emphasis: "manutencao" as const,
      reason: `Volume dentro da faixa (${v.setsPerWeek}/semana). Mantenha e priorize progressão de carga.`,
      goalLabel: null,
    };
  });
}

/** Total de séries da sessão — usado para conferir se o treino cabe no tempo. */
export function totalSets(prescriptions: GroupPrescription[]): number {
  return prescriptions.reduce((sum, p) => sum + p.setsToday, 0);
}

/**
 * Grupos que sustentam uma meta e **não** aparecem no plano de hoje nem estão
 * com volume em dia — o buraco que a tela de hoje sozinha nunca mostraria.
 */
export function uncoveredGoalMuscles(
  volume: GroupVolume[],
  goals: GoalProgress[]
): { id: MuscleGroupId; label: string; goalLabel: string; setsPerWeek: number; minTarget: number }[] {
  const volumeById = new Map(volume.map((v) => [v.id, v]));
  const out: { id: MuscleGroupId; label: string; goalLabel: string; setsPerWeek: number; minTarget: number }[] = [];

  for (const [muscle, goal] of goalsByMuscle(goals)) {
    const v = volumeById.get(muscle);
    if (!v || (v.status !== "insuficiente" && v.status !== "sem_registro")) continue;
    out.push({
      id: muscle,
      label: v.label,
      goalLabel: goal.label,
      setsPerWeek: v.setsPerWeek,
      minTarget: v.minTarget,
    });
  }

  return out;
}
