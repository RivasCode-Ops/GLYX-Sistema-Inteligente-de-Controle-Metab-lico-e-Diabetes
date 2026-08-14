import type { MuscleGroupId } from "@/lib/data/muscle-groups";
import type { CatalogExercise } from "@/lib/exercicios/catalog";

/**
 * Escolhe exercícios concretos do catálogo para as séries que a prescrição já
 * calculou — Fatia 4 do módulo Treino.
 *
 * A prescrição sabia dizer "peito, 4 séries hoje" e parava aí. Quem já treina
 * preenche a lacuna sozinho; quem está começando fica com um número e nenhuma
 * ação. O catálogo existe desde a Fatia 1 justamente para essa tradução, e até
 * agora só era usado na hora de registrar o que já tinha sido feito.
 */

/** Alvo de séries por exercício. Serve só para decidir QUANTOS exercícios
 * cobrem as séries do dia — as séries em si vêm da prescrição, não daqui. */
const SETS_PER_EXERCISE = 3;

/** Teto de exercícios por grupo numa sessão: além disso o treino vira lista de
 * compras e o tempo de descanso não fecha. Déficit grande se resolve com mais
 * frequência na semana, como já decidido na prescrição. */
const MAX_EXERCISES = 3;

export type ExercisePick = {
  exercise: CatalogExercise;
  sets: number;
  /** Quando o usuário registrou este exercício pela última vez, se registrou. */
  lastLoggedAt: string | null;
};

/** Divide `total` em `parts` inteiros o mais parecidos possível, sobra na frente. */
function splitSets(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const rest = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Exercícios sugeridos para um grupo, dado quantas séries ele recebeu hoje.
 *
 * A ordem de escolha é a regra que importa: **exercício que o usuário já
 * registrou vem primeiro**, do mais recente para o mais antigo. Não é
 * conservadorismo — é o que torna a progressão de carga mensurável. Sugerir
 * supino inclinado para quem vem fazendo supino reto zera a comparação com a
 * última vez, que é o único jeito de saber se ele está evoluindo. O catálogo
 * entra para completar quando o histórico não cobre.
 *
 * Cardio fica de fora: não tem músculo primário e não responde a prescrição de
 * séries.
 */
export function pickExercisesForGroup(
  catalog: CatalogExercise[],
  muscle: MuscleGroupId,
  setsToday: number,
  lastLoggedByExerciseId: Map<string, string> = new Map()
): ExercisePick[] {
  const candidates = catalog.filter(
    (e) => e.mechanic === "resistencia" && e.primaryMuscle === muscle
  );
  if (!candidates.length || setsToday <= 0) return [];

  const conhecidos = candidates
    .filter((e) => lastLoggedByExerciseId.has(e.id))
    .sort((a, b) => {
      const dataA = lastLoggedByExerciseId.get(a.id) ?? "";
      const dataB = lastLoggedByExerciseId.get(b.id) ?? "";
      return dataB.localeCompare(dataA);
    });

  const novos = candidates.filter((e) => !lastLoggedByExerciseId.has(e.id));
  const ordenados = [...conhecidos, ...novos];

  const quantos = Math.min(
    ordenados.length,
    MAX_EXERCISES,
    Math.max(1, Math.round(setsToday / SETS_PER_EXERCISE))
  );

  const distribuicao = splitSets(setsToday, quantos);

  return ordenados.slice(0, quantos).map((exercise, i) => ({
    exercise,
    sets: distribuicao[i],
    lastLoggedAt: lastLoggedByExerciseId.get(exercise.id) ?? null,
  }));
}

/**
 * Último registro de cada exercício do catálogo, a partir do histórico de carga.
 *
 * Só entram linhas com `exercise_id`: registro por texto livre não tem como ser
 * casado com o catálogo sem adivinhar o nome, que é a adivinhação que este
 * módulo inteiro existe para não fazer.
 */
export function lastLoggedByExercise(
  logs: { exercise_id: string | null; logged_at: string }[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const log of logs) {
    if (!log.exercise_id) continue;
    const atual = out.get(log.exercise_id);
    if (!atual || log.logged_at > atual) out.set(log.exercise_id, log.logged_at);
  }
  return out;
}
