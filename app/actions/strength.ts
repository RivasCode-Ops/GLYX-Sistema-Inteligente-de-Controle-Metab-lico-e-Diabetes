"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  exercise_name: z.string().min(1),
  muscle_group: z.string().optional(),
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
    exercise_name: formData.get("exercise_name"),
    muscle_group: formData.get("muscle_group") || undefined,
    weight_kg: formData.get("weight_kg") || undefined,
    reps: formData.get("reps"),
    sets: formData.get("sets") || undefined,
  });
  if (!parsed.success) return { error: "Preencha o exercício e as repetições." };

  const { error } = await supabase.from("strength_logs").insert({
    user_id: user.id,
    ...parsed.data,
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
