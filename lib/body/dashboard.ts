/**
 * Barras do painel de composição corporal.
 *
 * Cada barra tem uma definição fechada e verificável, escrita junto do número.
 * Barra de progresso sem definição é a forma mais fácil de mentir com dado:
 * "Hipertrofia 81%" não significa nada se ninguém sabe 81% de quê. Aqui:
 *
 * | Barra          | Definição                                                        |
 * |----------------|------------------------------------------------------------------|
 * | Massa muscular | média do progresso das metas de medidas de músculo               |
 * | Perda de gordura | média do progresso das metas de cintura/abdômen                |
 * | Recuperação    | quanto da janela de recuperação de cada grupo já passou           |
 * | Hipertrofia    | % dos exercícios com progressão de carga na janela               |
 * | Adesão         | minutos de treino da semana ÷ meta semanal                       |
 *
 * Sem dado para uma barra, o valor é `null` e a tela mostra o que falta
 * registrar — nunca 0% (que o usuário lê como "você fracassou") nem um número
 * inventado.
 */

import { MUSCLE_GROUPS, type MuscleGroupId } from "@/lib/data/muscle-groups";
import { BODY_FIELD_BY_KEY } from "@/lib/body/fields";
import type { GoalProgress } from "@/lib/body/goals";
import type { ExerciseProgression } from "@/lib/exercicios/weekly-volume";
import { progressionRate } from "@/lib/exercicios/weekly-volume";

export type DashboardBarKey =
  | "massa_muscular"
  | "perda_gordura"
  | "recuperacao"
  | "hipertrofia"
  | "adesao";

export type DashboardBar = {
  key: DashboardBarKey;
  label: string;
  /** 0-100, ou null quando não há dado suficiente. */
  percent: number | null;
  /** O que o número significa — vai junto na tela, não em tooltip escondido. */
  definition: string;
  /** O que fazer quando `percent` é null. */
  missing?: string;
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function averagePercent(values: number[]): number | null {
  if (!values.length) return null;
  return clampPercent(values.reduce((s, v) => s + v, 0) / values.length);
}

/**
 * Quanto da janela de recuperação de cada grupo já passou, em média (100% =
 * tudo recuperado). Grupo nunca treinado conta como recuperado — ele está
 * pronto, mesmo que por falta de treino; a cobrança disso é do volume, não daqui.
 */
export function recoveryPercent(
  lastTrainedByGroup: Partial<Record<MuscleGroupId, string>>,
  now: Date = new Date()
): number | null {
  const trained = MUSCLE_GROUPS.filter((g) => lastTrainedByGroup[g.id]);
  if (!trained.length) return null;

  const ratios = MUSCLE_GROUPS.map((group) => {
    const last = lastTrainedByGroup[group.id];
    if (!last) return 1;
    const hours = (now.getTime() - new Date(last).getTime()) / 3_600_000;
    return Math.min(1, hours / group.recoveryHours);
  });

  return clampPercent((ratios.reduce((s, r) => s + r, 0) / ratios.length) * 100);
}

export type DashboardInput = {
  goals: GoalProgress[];
  progressions: ExerciseProgression[];
  lastTrainedByGroup: Partial<Record<MuscleGroupId, string>>;
  weeklyMinutes: number;
  weeklyTargetMinutes: number;
  now?: Date;
};

export function buildDashboardBars(input: DashboardInput): DashboardBar[] {
  const { goals, progressions, lastTrainedByGroup, weeklyMinutes, weeklyTargetMinutes } = input;
  const now = input.now ?? new Date();

  const goalPercents = (role: "musculo" | "gordura"): number[] =>
    goals
      .filter((g) => BODY_FIELD_BY_KEY[g.key]?.role === role && g.progressPercent != null)
      .map((g) => g.progressPercent!);

  const muscle = averagePercent(goalPercents("musculo"));
  const fat = averagePercent(goalPercents("gordura"));
  const recovery = recoveryPercent(lastTrainedByGroup, now);
  const rate = progressionRate(progressions);
  const adherence =
    weeklyTargetMinutes > 0 ? clampPercent((weeklyMinutes / weeklyTargetMinutes) * 100) : null;

  return [
    {
      key: "massa_muscular",
      label: "Massa muscular",
      percent: muscle,
      definition: "Progresso médio das suas metas de medidas de músculo (peito, ombros, braços, coxas, panturrilhas).",
      missing: "Defina metas para medidas de músculo e registre pelo menos uma medição.",
    },
    {
      key: "perda_gordura",
      label: "Perda de gordura",
      percent: fat,
      definition: "Progresso médio das suas metas de cintura e abdômen.",
      missing: "Defina uma meta de cintura ou abdômen para acompanhar aqui.",
    },
    {
      key: "recuperacao",
      label: "Recuperação",
      percent: recovery,
      definition: "Quanto da janela de recuperação de cada grupo muscular já passou, na média dos grupos.",
      missing: "Registre treinos com grupo muscular para acompanhar a recuperação.",
    },
    {
      key: "hipertrofia",
      label: "Hipertrofia",
      percent: rate != null ? clampPercent(rate * 100) : null,
      definition: "Percentual dos seus exercícios com aumento de carga estimada (1RM) na janela analisada.",
      missing: "Registre carga, repetições e séries dos exercícios por algumas semanas.",
    },
    {
      key: "adesao",
      label: "Adesão ao plano",
      percent: adherence,
      definition: "Minutos de treino da semana em relação à sua meta semanal.",
      missing: "Registre sessões de treino nesta semana.",
    },
  ];
}
