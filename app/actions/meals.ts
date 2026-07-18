"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { uploadPrivatePhoto } from "@/lib/storage/upload-private-photo";
import { wallClockToUTC } from "@/lib/time/local-day";

/** "2026-07-18T13:04" (sem fuso, do <input type="datetime-local">) → ISO UTC. */
function localDateTimeToUTC(local: string, timezone: string | null | undefined): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return wallClockToUTC(Number(y), Number(mo), Number(d), Number(h), Number(mi), 0, timezone).toISOString();
}

const schema = z.object({
  name: z.string().min(1),
  calories: z.coerce.number().optional(),
  carbs_g: z.coerce.number().optional(),
  protein_g: z.coerce.number().optional(),
  fat_g: z.coerce.number().optional(),
  // datetime-local do formulário, sem fuso (ex.: "2026-07-18T13:04") — sem
  // isso, meals.eaten_at sempre virava "agora" (default da coluna), mesmo
  // quando o usuário registra bem depois de ter comido, distorcendo a
  // janela de detecção de pico glicêmico pós-refeição.
  eaten_at_local: z.string().optional(),
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
    eaten_at_local: formData.get("eaten_at_local") || undefined,
  });
  if (!parsed.success) return { error: "Preencha pelo menos o nome da refeição." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const { eaten_at_local, ...rest } = parsed.data;
  const eatenAt = eaten_at_local
    ? localDateTimeToUTC(eaten_at_local, profile?.timezone)
    : undefined;

  const { error } = await supabase.from("meals").insert({
    user_id: user.id,
    ...rest,
    ...(eatenAt ? { eaten_at: eatenAt } : {}),
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
  // z.coerce.boolean() trata qualquer string não-vazia (inclusive "false")
  // como true — comparamos o valor literal em vez de usar coerce.
  ai_corrected: z.preprocess((v) => v === "true", z.boolean()).default(false),
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
    ai_corrected: formData.get("ai_corrected"),
  });
  if (!parsed.success) return { error: "Preencha pelo menos o nome da refeição." };

  const photoPath = await uploadPrivatePhoto(
    supabase,
    "meal-photos",
    user.id,
    formData.get("image"),
    MAX_PHOTO_BYTES
  );

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

const photoItemSchema = z.object({
  name: z.string().min(1),
  calories: z.coerce.number().optional(),
  carbs_g: z.coerce.number().optional(),
  protein_g: z.coerce.number().optional(),
  fat_g: z.coerce.number().optional(),
  glycemic_load_estimate: z.coerce.number().optional(),
  notes: z.string().optional(),
  ai_corrected: z.boolean().optional().default(false),
});
const photoItemsSchema = z.array(photoItemSchema).min(1);

/** Salva cada item marcado da foto como uma refeição SEPARADA (prato, bebida
 * etc. não viram mais um único registro somado) — todas compartilham a
 * mesma foto enviada, já que vieram da mesma análise. */
export async function saveMealPhotoItems(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  let itemsRaw: unknown;
  try {
    itemsRaw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Itens inválidos." };
  }
  const parsed = photoItemsSchema.safeParse(itemsRaw);
  if (!parsed.success) return { error: "Marque pelo menos um item com nome preenchido." };

  const photoPath = await uploadPrivatePhoto(
    supabase,
    "meal-photos",
    user.id,
    formData.get("image"),
    MAX_PHOTO_BYTES
  );

  const eatenAt = new Date().toISOString();
  const rows = parsed.data.map((item) => ({
    user_id: user.id,
    ...item,
    photo_path: photoPath,
    eaten_at: eatenAt,
  }));

  const { error } = await supabase.from("meals").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/alimentacao");
  revalidatePath("/alimentacao/refeicoes");
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

  // saveMealPhotoItems dá o MESMO photo_path a vários itens da mesma foto —
  // só apaga do bucket se nenhuma refeição "irmã" ainda referenciar essa
  // imagem, senão as outras ficam com a foto quebrada.
  if (meal?.photo_path) {
    const { count } = await supabase
      .from("meals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("photo_path", meal.photo_path);
    if (!count) {
      await supabase.storage.from("meal-photos").remove([meal.photo_path]);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/alimentacao");
  revalidatePath("/alimentacao/refeicoes");
  return { ok: true };
}
