"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MUSCLE_GROUP_IDS } from "@/lib/data/muscle-groups";

const schema = z.object({
  label: z.string().min(1),
  duration_min: z.coerce.number().optional(),
  calories_burned: z.coerce.number().optional(),
  intensity: z.string().optional(),
});

export type ActionResult = { ok?: true; error?: string };

const muscleGroupsSchema = z.array(z.enum(MUSCLE_GROUP_IDS as [string, ...string[]])).min(1);
const trainingTypeSchema = z.enum(["forca", "resistencia"]).optional();

const TRAINING_TYPE_LABEL: Record<"forca" | "resistencia", string> = {
  forca: "Treino de força",
  resistencia: "Treino de resistência",
};

/** Registro rápido do painel de recuperação: "malhei hoje" com os grupos marcados. */
export async function logMuscleTraining(
  muscleGroups: string[],
  trainingType?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsedGroups = muscleGroupsSchema.safeParse(muscleGroups);
  if (!parsedGroups.success) return { error: "Selecione pelo menos um grupo muscular." };
  const parsedType = trainingTypeSchema.safeParse(trainingType);
  const type = parsedType.success ? parsedType.data : undefined;

  const { error } = await supabase.from("exercise_sessions").insert({
    user_id: user.id,
    label: type ? TRAINING_TYPE_LABEL[type] : "Treino",
    intensity: type ?? null,
    muscle_groups: parsedGroups.data,
  });

  if (error) return { error: error.message };

  // Treinar um grupo que estava pausado é o próprio usuário dizendo que já
  // consegue seguir o plano nele de novo — retoma automaticamente.
  await supabase
    .from("muscle_pauses")
    .update({ resumed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("muscle_group", parsedGroups.data)
    .is("resumed_at", null);

  revalidatePath("/exercicios");
  revalidatePath("/exercicios/recuperacao");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Pausa manual de um grupo ("não consigo seguir o plano nele agora") — sem prazo fixo, até o usuário liberar. */
export async function pauseMuscleGroup(muscleGroup: string, reason?: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = z.enum(MUSCLE_GROUP_IDS as [string, ...string[]]).safeParse(muscleGroup);
  if (!parsed.success) return { error: "Grupo muscular inválido." };

  const { error } = await supabase.from("muscle_pauses").insert({
    user_id: user.id,
    muscle_group: parsed.data,
    reason: reason?.trim() || null,
  });

  if (error) {
    if (error.code === "23505") return { error: "Esse grupo já está pausado." };
    return { error: error.message };
  }

  revalidatePath("/exercicios/recuperacao");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Libera um grupo pausado, voltando ao cronômetro normal de recuperação. */
export async function resumeMuscleGroup(muscleGroup: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("muscle_pauses")
    .update({ resumed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("muscle_group", muscleGroup)
    .is("resumed_at", null);

  if (error) return { error: error.message };

  revalidatePath("/exercicios/recuperacao");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function addExerciseSession(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    label: formData.get("label"),
    duration_min: formData.get("duration_min") || undefined,
    calories_burned: formData.get("calories_burned") || undefined,
    intensity: formData.get("intensity") || undefined,
  });
  if (!parsed.success) return { error: "Descreva a atividade." };

  const { error } = await supabase.from("exercise_sessions").insert({
    user_id: user.id,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidatePath("/exercicios");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteExerciseSession(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Registro inválido." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("exercise_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/exercicios");
  revalidatePath("/exercicios/sessoes");
  revalidatePath("/dashboard");
  return { ok: true };
}
