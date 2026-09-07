"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Plano de hipoglicemia — conduta DO USUÁRIO, definida com o médico dele.
 *
 * O app não sugere texto, não sugere quantidade e não tem limiar embutido. Os
 * limites abaixo são de sanidade (o mesmo papel dos limites da faixa alvo), não
 * conduta: eles impedem 5 minutos e 500 mg/dL de entrarem no banco, e é só.
 *
 * O `threshold_mg_dl` chega pré-preenchido no formulário com o limite inferior
 * da faixa alvo que a pessoa já configurou, e ela confirma ou altera. Nenhum
 * número clínico nasce daqui.
 */

export type ActionResult = { ok?: true; error?: string };

const schema = z.object({
  correction_text: z.string().trim().min(3, "Descreva a conduta combinada com seu médico."),
  recheck_minutes: z.coerce.number().int().min(5).max(60),
  threshold_mg_dl: z.coerce.number().int().min(50).max(100),
  emergency_text: z.string().trim().max(500).optional(),
});

export async function saveHypoPlan(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    correction_text: formData.get("correction_text"),
    recheck_minutes: formData.get("recheck_minutes"),
    threshold_mg_dl: formData.get("threshold_mg_dl"),
    emergency_text: formData.get("emergency_text") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Confira os campos do plano." };
  }

  const { error } = await supabase.from("hypo_plan").upsert(
    {
      user_id: user.id,
      correction_text: parsed.data.correction_text,
      recheck_minutes: parsed.data.recheck_minutes,
      threshold_mg_dl: parsed.data.threshold_mg_dl,
      emergency_text: parsed.data.emergency_text ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) return { error: error.message };

  revalidatePath("/perfil/hipoglicemia");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * "Fiz" no card. Fecha a primeira metade do ciclo.
 *
 * Grava `acted_at` no evento aberto; não grava conduta nenhuma, porque o app
 * não sabe o que a pessoa fez além de ter seguido o próprio plano.
 */
export async function markHypoActed(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const eventId = formData.get("event_id") as string | null;
  if (!eventId) return { error: "Evento inválido." };

  const { error } = await supabase
    .from("hypo_events")
    .update({ acted_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("user_id", user.id)
    .is("acted_at", null);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

/** Reavaliação registrada: fecha o ciclo com o valor medido. */
export async function recordHypoRecheck(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const eventId = formData.get("event_id") as string | null;
  const valor = Number(formData.get("glucose_mg_dl"));
  if (!eventId) return { error: "Evento inválido." };
  if (!Number.isFinite(valor) || valor < 20 || valor > 600) {
    return { error: "Informe a glicemia medida (20 a 600 mg/dL)." };
  }

  const { error } = await supabase
    .from("hypo_events")
    .update({ recheck_at: new Date().toISOString(), recheck_mg_dl: Math.round(valor) })
    .eq("id", eventId)
    .eq("user_id", user.id)
    .is("recheck_at", null);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
