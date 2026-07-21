"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Registro de insulina EXTRA (correção quando a glicemia está alta, dose de
// refeição fora da agenda etc.): guarda o que o usuário JÁ aplicou, por
// orientação médica.
//
// Este arquivo não calcula nem sugere dose. O cálculo educativo existe e vive
// separado, em lib/medications/bolus-calculator.ts — a partir de parâmetros que
// o próprio usuário configurou com o médico, bloqueado em hipoglicemia e sem
// gravar nada. Manter as duas coisas apartadas é intencional: o que é registro
// do passado não deve virar recomendação para o futuro.

export type ActionResult = { ok?: true; error?: string };

const schema = z.object({
  units: z.coerce.number().min(0.5, "Mínimo 0,5 U").max(100, "Máximo 100 U"),
  insulin_kind: z.enum(["rapida", "basal", "outra"]).default("rapida"),
  reason: z.enum(["correcao", "refeicao", "outra"]).default("correcao"),
  glucose_mg_dl: z.coerce.number().int().min(20).max(600).optional(),
  notes: z.string().max(300).optional(),
});

export async function addInsulinLog(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    units: formData.get("units"),
    insulin_kind: formData.get("insulin_kind") || undefined,
    reason: formData.get("reason") || undefined,
    glucose_mg_dl: formData.get("glucose_mg_dl") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { error } = await supabase.from("insulin_logs").insert({
    user_id: user.id,
    units: parsed.data.units,
    insulin_kind: parsed.data.insulin_kind,
    reason: parsed.data.reason,
    glucose_mg_dl: parsed.data.glucose_mg_dl ?? null,
    notes: parsed.data.notes?.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/glicemia");
  revalidatePath("/historico");
  return { ok: true };
}

export async function deleteInsulinLog(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Registro inválido." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("insulin_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/glicemia");
  revalidatePath("/historico");
  return { ok: true };
}
