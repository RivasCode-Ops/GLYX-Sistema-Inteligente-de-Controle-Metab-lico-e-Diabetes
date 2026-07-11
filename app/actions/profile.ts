"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  full_name: z.string().optional(),
  diabetes_type: z.string().optional(),
  target_glucose_min: z.coerce.number().optional(),
  target_glucose_max: z.coerce.number().optional(),
});

export type ActionResult = { ok?: true; error?: string };

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    full_name: formData.get("full_name") || undefined,
    diabetes_type: formData.get("diabetes_type") || undefined,
    target_glucose_min: formData.get("target_glucose_min") || undefined,
    target_glucose_max: formData.get("target_glucose_max") || undefined,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/perfil");
  return { ok: true };
}
