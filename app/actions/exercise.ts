"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  label: z.string().min(1),
  duration_min: z.coerce.number().optional(),
  calories_burned: z.coerce.number().optional(),
  intensity: z.string().optional(),
});

export type ActionResult = { ok?: true; error?: string };

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
