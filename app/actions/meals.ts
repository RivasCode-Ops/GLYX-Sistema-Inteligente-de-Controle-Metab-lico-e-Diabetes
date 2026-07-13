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

const photoSchema = z.object({
  name: z.string().min(1),
  calories: z.coerce.number().optional(),
  carbs_g: z.coerce.number().optional(),
  protein_g: z.coerce.number().optional(),
  fat_g: z.coerce.number().optional(),
  glycemic_load_estimate: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Confirma e salva a refeição revisada pelo usuário após a análise por foto. */
export async function saveMealPhoto(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = photoSchema.safeParse({
    name: formData.get("name"),
    calories: formData.get("calories") || undefined,
    carbs_g: formData.get("carbs_g") || undefined,
    protein_g: formData.get("protein_g") || undefined,
    fat_g: formData.get("fat_g") || undefined,
    glycemic_load_estimate: formData.get("glycemic_load_estimate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: "Preencha pelo menos o nome da refeição." };

  let photoPath: string | null = null;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0 && file.size <= MAX_PHOTO_BYTES) {
    const mime = file.type || "image/jpeg";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await supabase.storage
      .from("meal-photos")
      .upload(path, buffer, { contentType: mime });
    if (!upload.error) photoPath = path;
  }

  const { error } = await supabase.from("meals").insert({
    user_id: user.id,
    ...parsed.data,
    photo_path: photoPath,
    eaten_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/alimentacao");
  return { ok: true };
}

export async function deleteMeal(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Registro inválido." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { data: meal } = await supabase
    .from("meals")
    .select("photo_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("meals").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  // Remove a foto do bucket (melhor esforço — registro já foi excluído)
  if (meal?.photo_path) {
    await supabase.storage.from("meal-photos").remove([meal.photo_path]);
  }

  revalidatePath("/dashboard");
  revalidatePath("/alimentacao");
  revalidatePath("/alimentacao/refeicoes");
  return { ok: true };
}
