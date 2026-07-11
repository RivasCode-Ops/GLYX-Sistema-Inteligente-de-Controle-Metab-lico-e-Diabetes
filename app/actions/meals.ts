"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().min(1),
  calories: z.coerce.number().optional(),
  carbs_g: z.coerce.number().optional(),
  protein_g: z.coerce.number().optional(),
  fat_g: z.coerce.number().optional(),
});

export type ActionResult = { ok?: true; error?: string };

export async function addMeal(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    name: formData.get("name"),
    calories: formData.get("calories") || undefined,
    carbs_g: formData.get("carbs_g") || undefined,
    protein_g: formData.get("protein_g") || undefined,
    fat_g: formData.get("fat_g") || undefined,
  });
  if (!parsed.success) return { error: "Preencha pelo menos o nome da refeição." };

  const { error } = await supabase.from("meals").insert({
    user_id: user.id,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/alimentacao");
  return { ok: true };
}
