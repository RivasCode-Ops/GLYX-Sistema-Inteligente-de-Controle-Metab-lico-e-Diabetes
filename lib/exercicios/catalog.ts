import type { MuscleGroupId } from "@/lib/data/muscle-groups";

/**
 * Vocabulário e regras do catálogo de exercícios (`public.exercises`, semeado
 * pela migration da Fatia 1).
 *
 * Este arquivo é **puro de propósito**: o formulário de carga é componente
 * cliente e importa `groupByCategory` daqui. Juntar a consulta ao Supabase no
 * mesmo módulo arrastava `next/headers` para o pacote do navegador e quebrava o
 * build. As consultas ficam em `lib/queries/exercise-catalog.ts`, que é onde o
 * resto do app já guarda acesso a banco.
 */

export type CatalogExercise = {
  id: string;
  slug: string;
  name: string;
  mechanic: "resistencia" | "cardio";
  /**
   * Nulo só em cardio — o CHECK `exercises_muscle_matches_mechanic` garante isso
   * no banco, então o nulo aqui carrega significado em vez de ser ausência de
   * dado.
   */
  primaryMuscle: MuscleGroupId | null;
  sourceCategory: string;
};

export type CatalogGroup = { category: string; exercises: CatalogExercise[] };

/**
 * Agrupa por `source_category` preservando a ordem de chegada.
 *
 * A categoria é a do infográfico de origem, não o músculo primário — e as duas
 * divergem de propósito (elevação pélvica vem em "Pernas" e é de glúteos). Quem
 * escolhe na lista procura pelo lugar onde aprendeu o exercício, então a lista
 * segue a categoria; o músculo é problema da derivação, não da navegação.
 */
export function groupByCategory(exercises: CatalogExercise[]): CatalogGroup[] {
  const groups: CatalogGroup[] = [];
  const byCategory = new Map<string, CatalogGroup>();

  for (const exercise of exercises) {
    let group = byCategory.get(exercise.sourceCategory);
    if (!group) {
      group = { category: exercise.sourceCategory, exercises: [] };
      byCategory.set(exercise.sourceCategory, group);
      groups.push(group);
    }
    group.exercises.push(exercise);
  }

  return groups;
}

/** O que vai gravado em `strength_logs` depois de resolvida a origem. */
export type ResolvedStrengthEntry = {
  exerciseId: string | null;
  exerciseName: string;
  muscleGroup: MuscleGroupId | null;
};

/**
 * Decide nome e músculo de um registro de carga.
 *
 * A regra é uma só: **o catálogo ganha do formulário**. Quando o exercício veio
 * da lista, nome e músculo saem da linha do catálogo e o que o cliente mandou é
 * ignorado — não por desconfiança do usuário, mas porque o valor do catálogo é
 * ser fonte única. Se o formulário pudesse sobrescrever, voltaríamos a ter
 * "Supino Reto" e "supino reto" como exercícios distintos, que é exatamente o
 * problema que a Fatia 1 existiu para resolver.
 *
 * Cardio entra com `muscleGroup` nulo em vez de um músculo aproximado: esteira
 * não fadiga um grupo, e inventar um faria o motor de recuperação mandar
 * descansar algo que não foi treinado.
 */
export function resolveStrengthEntry(
  exercise: CatalogExercise | null,
  freeTextName: string
): ResolvedStrengthEntry | null {
  if (exercise) {
    return {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      muscleGroup: exercise.primaryMuscle,
    };
  }

  const name = freeTextName.trim();
  if (!name) return null;

  // Sem id não há de onde derivar músculo: preencher com palpite a partir do
  // texto seria o backfill por adivinhação que a Fatia 1 recusou, só que na
  // hora da escrita.
  return { exerciseId: null, exerciseName: name, muscleGroup: null };
}
