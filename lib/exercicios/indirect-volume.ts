import type { MuscleGroupId } from "@/lib/data/muscle-groups";
import type { CatalogExercise } from "@/lib/exercicios/catalog";

/**
 * Séries **indiretas** por grupo — Fatia 5 do módulo Treino.
 *
 * Supino trabalha tríceps e ombro nas mesmas séries em que trabalha peito, e
 * até aqui isso não existia em lugar nenhum: o volume contava só o primário.
 * Quem treina peito e costas com compostos aparecia com tríceps e bíceps
 * "insuficientes" sem nunca ter deixado de estimulá-los.
 *
 * ---------------------------------------------------------------------------
 * Esta conta é SEPARADA da que compara com a meta, e isso é a decisão inteira
 * ---------------------------------------------------------------------------
 * `WEEKLY_SET_TARGET` já embute trabalho indireto — a própria definição dos
 * alvos diz que grupos pequenos recebem menos "porque também são recrutados
 * indiretamente nos compostos". Somar série secundária no mesmo contador
 * compararia número inflado contra alvo calibrado para trabalho direto: não dá
 * erro, não dá número absurdo, dá um volume plausível e errado. O
 * CONTEXTO_TECNICO §4.10 previu por escrito que esta seria a armadilha desta
 * fatia; a saída é a série indireta viver num campo próprio e rotulado, que
 * informa sem contaminar a comparação.
 *
 * Uma série indireta vale **uma série**, não meia. Ponderar exigiria um fator
 * por par exercício-músculo que ninguém mediu, e um número inventado com uma
 * casa decimal parece mais preciso que o palpite que é. Contar inteiro e dizer
 * que é indireta é honesto e igualmente útil.
 */

export type IndirectLogRow = {
  exercise_id: string | null;
  sets: number;
  logged_at: string;
};

/** Séries indiretas por grupo na janela, a partir dos registros com catálogo. */
export function computeIndirectVolume(
  logs: IndirectLogRow[],
  catalog: CatalogExercise[],
  weeks: number,
  now: Date = new Date()
): Map<MuscleGroupId, number> {
  const windowStart = now.getTime() - weeks * 7 * 86_400_000;
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const totals = new Map<MuscleGroupId, number>();

  for (const log of logs) {
    // Sem `exercise_id` não há vetor de ativação: registro por texto livre não
    // diz nem o músculo primário, quanto mais os secundários.
    if (!log.exercise_id) continue;
    if (new Date(log.logged_at).getTime() < windowStart) continue;

    const exercise = byId.get(log.exercise_id);
    if (!exercise) continue;

    for (const muscle of exercise.secondaryMuscles) {
      totals.set(muscle, (totals.get(muscle) ?? 0) + log.sets);
    }
  }

  return totals;
}

/** Séries indiretas por semana, arredondadas como o volume direto. */
export function indirectSetsPerWeek(
  totals: Map<MuscleGroupId, number>,
  weeks: number
): Map<MuscleGroupId, number> {
  const out = new Map<MuscleGroupId, number>();
  for (const [id, total] of totals) {
    out.set(id, Math.round((total / Math.max(weeks, 1)) * 10) / 10);
  }
  return out;
}
