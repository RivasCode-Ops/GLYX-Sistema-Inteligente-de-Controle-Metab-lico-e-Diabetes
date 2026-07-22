"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { evaluateGlucoseAlert } from "@/lib/insights/rules";
import { createClient } from "@/lib/supabase/server";
import { wallClockToUTC } from "@/lib/time/local-day";

const schema = z.object({
  value_mg_dl: z.coerce.number().min(20).max(600),
  context: z.string().optional(),
  // Sem isso, recorded_at sempre virava "agora" (default da coluna), mesmo
  // registrando bem depois de medir — mesmo problema já corrigido em
  // refeições e exercício.
  recorded_at_local: z.string().optional(),
});

/** "2026-07-18T13:04" (sem fuso) → ISO UTC. */
function localDateTimeToUTC(local: string, timezone: string | null | undefined): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return wallClockToUTC(Number(y), Number(mo), Number(d), Number(h), Number(mi), 0, timezone).toISOString();
}

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
    recorded_at_local: formData.get("recorded_at_local") || undefined,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const recordedAt = parsed.data.recorded_at_local
    ? localDateTimeToUTC(parsed.data.recorded_at_local, profile?.timezone)
    : null;

  const { error } = await supabase.from("glucose_readings").insert({
    user_id: user.id,
    value_mg_dl: parsed.data.value_mg_dl,
    context: parsed.data.context ?? null,
    source: "manual",
    ...(recordedAt ? { recorded_at: recordedAt } : {}),
  });

  if (error) return { error: error.message };

  await evaluateGlucoseAlert(
    supabase,
    user.id,
    { valueMgDl: parsed.data.value_mg_dl, recordedAt: recordedAt ?? new Date().toISOString() },
    "manual"
  );

  revalidatePath("/dashboard");
  revalidatePath("/glicemia");
  revalidatePath("/glicemia/historico");
  revalidatePath("/glicemia/tendencias");
  revalidatePath("/analise/alertas");
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
