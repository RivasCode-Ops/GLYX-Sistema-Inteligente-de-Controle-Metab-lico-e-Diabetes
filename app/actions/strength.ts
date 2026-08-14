"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveStrengthEntry, type CatalogExercise } from "@/lib/exercicios/catalog";
import { getCatalogExercise } from "@/lib/queries/exercise-catalog";

const schema = z.object({
  // Opcional porque o par (id do catálogo, texto livre) é excludente: quem
  // escolheu da lista não digita nome, e a validação do par é feita depois de
  // resolver a origem, onde dá para dizer qual dos dois faltou.
  exercise_name: z.string().optional(),
  exercise_id: z.string().uuid().optional(),
  weight_kg: z.coerce.number().min(0).max(500).optional(),
  reps: z.coerce.number().int().min(1).max(100),
  sets: z.coerce.number().int().min(1).max(20).default(1),
});

export type ActionResult = { ok?: true; error?: string };

/** Registro de carga por exercício — separado do "malhei hoje" (grupo
 * muscular geral) pra permitir comparar peso/reps com a última vez no MESMO
 * exercício, não só saber que o grupo foi treinado. */
export async function logStrengthSet(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    exercise_name: formData.get("exercise_name") || undefined,
    exercise_id: formData.get("exercise_id") || undefined,
    weight_kg: formData.get("weight_kg") || undefined,
    reps: formData.get("reps"),
    sets: formData.get("sets") || undefined,
  });
  if (!parsed.success) return { error: "Preencha o exercício e as repetições." };

  const { exercise_id, exercise_name, ...measures } = parsed.data;

  // O catálogo é relido aqui em vez de o cliente mandar nome e músculo prontos.
  // Um id vindo do formulário é só uma alegação; o que decide o que fica gravado
  // é a linha do catálogo. É isso que impede o mesmo exercício de voltar a
  // entrar com nome divergente e músculo escolhido a dedo.
  let exercise: CatalogExercise | null = null;
  if (exercise_id) {
    exercise = await getCatalogExercise(supabase, exercise_id);
    if (!exercise) return { error: "Exercício não encontrado no catálogo." };
  }

  const resolved = resolveStrengthEntry(exercise, exercise_name ?? "");
  if (!resolved) return { error: "Escolha um exercício da lista ou digite o nome." };

  const { error } = await supabase.from("strength_logs").insert({
    user_id: user.id,
    exercise_id: resolved.exerciseId,
    exercise_name: resolved.exerciseName,
    muscle_group: resolved.muscleGroup,
    ...measures,
  });
  if (error) return { error: error.message };

  revalidatePath("/exercicios/recuperacao");
  revalidatePath("/exercicios");
  return { ok: true };
}

export async function deleteStrengthLog(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Registro inválido." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("strength_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/exercicios/recuperacao");
  return { ok: true };
}
