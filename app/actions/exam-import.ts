"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Importa para os registros do app um valor extraído de um exame — sempre
// disparado por um clique explícito do usuário na tela do exame.

export type ActionResult = { ok?: true; error?: string };

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("weight"), weightKg: z.coerce.number().gt(20).lt(400) }),
  z.object({
    kind: z.literal("glucose_jejum"),
    mgDl: z.coerce.number().int().min(20).max(600),
  }),
]);

export async function importExamValue(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    kind: formData.get("kind"),
    weightKg: formData.get("weightKg") ?? undefined,
    mgDl: formData.get("mgDl") ?? undefined,
  });
  if (!parsed.success) return { error: "Valor inválido." };

  if (parsed.data.kind === "weight") {
    // Uma pesagem por dia: a mais recente substitui (mesma regra do perfil).
    const { error } = await supabase.from("weight_logs").upsert(
      {
        user_id: user.id,
        weight_kg: parsed.data.weightKg,
        logged_on: new Date().toISOString().slice(0, 10),
      },
      { onConflict: "user_id,logged_on" }
    );
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("glucose_readings").insert({
      user_id: user.id,
      value_mg_dl: parsed.data.mgDl,
      context: "jejum",
      source: "manual",
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/glicemia");
  revalidatePath("/perfil");
  return { ok: true };
}
