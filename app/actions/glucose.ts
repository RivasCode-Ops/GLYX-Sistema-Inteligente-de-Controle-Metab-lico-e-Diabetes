"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { evaluateAfterGlucoseReading } from "@/lib/insights/rules";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  value_mg_dl: z.coerce.number().min(20).max(600),
  context: z.string().optional(),
});

export type ActionResult = { ok?: true; error?: string };

export async function addGlucoseReading(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    value_mg_dl: formData.get("value_mg_dl"),
    context: formData.get("context") || undefined,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const { error } = await supabase.from("glucose_readings").insert({
    user_id: user.id,
    value_mg_dl: parsed.data.value_mg_dl,
    context: parsed.data.context ?? null,
    source: "manual",
  });

  if (error) return { error: error.message };

  await evaluateAfterGlucoseReading(supabase, user.id, parsed.data.value_mg_dl);

  revalidatePath("/dashboard");
  revalidatePath("/glicemia");
  revalidatePath("/alertas");
  return { ok: true };
}

export async function deleteGlucoseReading(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Registro inválido." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("glucose_readings")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/glicemia");
  revalidatePath("/glicemia/historico");
  revalidatePath("/glicemia/tendencias");
  return { ok: true };
}
