/**
 * Volume semanal por grupo muscular e progressão de carga, a partir de
 * `strength_logs`.
 *
 * Volume aqui é **séries por semana por grupo**, não tonelagem: é a métrica
 * com melhor suporte na literatura de hipertrofia (Schoenfeld et al.) e a única
 * que o app consegue contar sem pedir esforço percebido a cada série.
 *
 * As faixas são referência geral de treino, não prescrição individual — quem
 * treina há 10 anos e quem começou ontem não respondem ao mesmo volume. Servem
 * para responder "meu volume de costas está baixo pro que eu quero?", não para
 * mandar ninguém fazer 20 séries.
 */

import { resolveMuscleGroupIds, MUSCLE_GROUPS, type MuscleGroupId } from "@/lib/data/muscle-groups";

export type StrengthLogRow = {
  exercise_name: string;
  muscle_group: string | null;
  weight_kg: number | null;
  reps: number;
  sets: number;
  logged_at: string;
};

/**
 * Séries semanais por grupo: `min` é o piso abaixo do qual o estímulo tende a
 * ser insuficiente para hipertrofia; `optimal` é o meio da faixa comumente
 * citada (10-20 para grupos grandes). Grupos pequenos recebem menos porque
 * também são recrutados indiretamente nos compostos.
 */
export const WEEKLY_SET_TARGET: Record<MuscleGroupId, { min: number; optimal: number }> = {
  peito: { min: 10, optimal: 16 },
  costas: { min: 10, optimal: 18 },
  quadriceps: { min: 10, optimal: 16 },
  posterior: { min: 8, optimal: 14 },
  ombros: { min: 8, optimal: 16 },
  biceps: { min: 6, optimal: 12 },
  triceps: { min: 6, optimal: 12 },
  abdomen: { min: 6, optimal: 12 },
  panturrilhas: { min: 8, optimal: 14 },
  antebracos: { min: 4, optimal: 8 },
};

export type VolumeStatus = "sem_registro" | "insuficiente" | "adequado" | "otimo" | "alto";

export type GroupVolume = {
  id: MuscleGroupId;
  label: string;
  setsPerWeek: number;
  totalSets: number;
  minTarget: number;
  optimalTarget: number;
  status: VolumeStatus;
};

/** Acima de 1,5× o alvo ótimo, mais provável que atrapalhe a recuperação do que ajude. */
const HIGH_VOLUME_FACTOR = 1.5;

function statusFor(setsPerWeek: number, target: { min: number; optimal: number }): VolumeStatus {
  if (setsPerWeek <= 0) return "sem_registro";
  if (setsPerWeek < target.min) return "insuficiente";
  if (setsPerWeek > target.optimal * HIGH_VOLUME_FACTOR) return "alto";
  if (setsPerWeek >= target.optimal) return "otimo";
  return "adequado";
}

/**
 * Séries por semana de cada grupo na janela.
 *
 * `weeks` divide o total: com 4 semanas de janela e 40 séries de costas, são 10
 * séries/semana. Grupo sem nenhum registro entra com 0 em vez de sumir — "não
 * treinei costas" é exatamente o achado que interessa.
 */
export function computeWeeklyVolume(
  logs: StrengthLogRow[],
  weeks: number,
  now: Date = new Date()
): GroupVolume[] {
  const windowStart = now.getTime() - weeks * 7 * 86_400_000;
  const totals = new Map<MuscleGroupId, number>();

  for (const log of logs) {
    if (new Date(log.logged_at).getTime() < windowStart) continue;
    const groups = log.muscle_group ? resolveMuscleGroupIds(log.muscle_group) : [];
    for (const id of groups) {
      totals.set(id, (totals.get(id) ?? 0) + log.sets);
    }
  }

  return MUSCLE_GROUPS.map((group) => {
    const totalSets = totals.get(group.id) ?? 0;
    const setsPerWeek = Math.round((totalSets / Math.max(weeks, 1)) * 10) / 10;
    const target = WEEKLY_SET_TARGET[group.id];
    return {
      id: group.id,
      label: group.label,
      setsPerWeek,
      totalSets,
      minTarget: target.min,
      optimalTarget: target.optimal,
      status: statusFor(setsPerWeek, target),
    };
  });
}

/** 1RM estimado (Epley) — normaliza séries de repetições diferentes numa escala só. */
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps > 0)) return null;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export type ExerciseProgression = {
  exercise: string;
  muscleGroup: string | null;
  firstOneRm: number;
  lastOneRm: number;
  deltaPercent: number;
  sessions: number;
  progressing: boolean;
};

/** Ganho abaixo disto em semanas de treino é ruído de execução, não progressão. */
const PROGRESSION_THRESHOLD_PERCENT = 2.5;

/**
 * Progressão de carga por exercício: melhor 1RM estimado da primeira metade da
 * janela contra a melhor da segunda metade.
 *
 * Meia janela em vez de "primeiro log × último log" porque um dia ruim no fim
 * (dormiu mal, treinou em jejum) apagaria semanas de progresso real.
 */
export function computeProgression(
  logs: StrengthLogRow[],
  weeks: number,
  now: Date = new Date()
): ExerciseProgression[] {
  const windowStart = now.getTime() - weeks * 7 * 86_400_000;
  const midpoint = windowStart + (now.getTime() - windowStart) / 2;

  const byExercise = new Map<
    string,
    { muscleGroup: string | null; first: number[]; last: number[]; sessions: Set<string> }
  >();

  for (const log of logs) {
    const at = new Date(log.logged_at).getTime();
    if (at < windowStart) continue;
    const oneRm = log.weight_kg != null ? estimatedOneRepMax(Number(log.weight_kg), log.reps) : null;
    if (oneRm == null) continue;

    const key = log.exercise_name.trim().toLowerCase();
    const entry = byExercise.get(key) ?? {
      muscleGroup: log.muscle_group,
      first: [],
      last: [],
      sessions: new Set<string>(),
    };
    entry.sessions.add(log.logged_at.slice(0, 10));
    (at < midpoint ? entry.first : entry.last).push(oneRm);
    byExercise.set(key, entry);
  }

  const out: ExerciseProgression[] = [];
  for (const [name, entry] of byExercise) {
    if (!entry.first.length || !entry.last.length) continue;
    const firstOneRm = Math.max(...entry.first);
    const lastOneRm = Math.max(...entry.last);
    const deltaPercent = Math.round(((lastOneRm - firstOneRm) / firstOneRm) * 1000) / 10;
    out.push({
      exercise: name,
      muscleGroup: entry.muscleGroup,
      firstOneRm,
      lastOneRm,
      deltaPercent,
      sessions: entry.sessions.size,
      progressing: deltaPercent >= PROGRESSION_THRESHOLD_PERCENT,
    });
  }

  return out.sort((a, b) => b.deltaPercent - a.deltaPercent);
}

/** Fração de exercícios com progressão de carga na janela (0-1), ou null sem dado. */
export function progressionRate(progressions: ExerciseProgression[]): number | null {
  if (!progressions.length) return null;
  return progressions.filter((p) => p.progressing).length / progressions.length;
}
