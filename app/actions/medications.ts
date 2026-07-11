"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const medSchema = z.object({
  name: z.string().min(1),
  dosage: z.string().optional(),
  schedule_hint: z.string().optional(),
  reminder_times: z.array(z.string().regex(TIME_RE)).optional(),
});

// "08:00, 20h30, 7:5" → ["08:00", "20:30"] (inválidos são descartados)
function parseReminderTimes(input: string): string[] {
  return input
    .split(/[,;]/)
    .map((t) => t.trim().replace("h", ":").replace(/^(\d):/, "0$1:"))
    .filter((t) => TIME_RE.test(t));
}

export type ActionResult = { ok?: true; error?: string };

export async function addMedication(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const timesRaw = String(formData.get("reminder_times") ?? "").trim();
  const reminderTimes = timesRaw ? parseReminderTimes(timesRaw) : [];

  const parsed = medSchema.safeParse({
    name: formData.get("name"),
    dosage: formData.get("dosage") || undefined,
    schedule_hint: formData.get("schedule_hint") || undefined,
    reminder_times: reminderTimes.length ? reminderTimes : undefined,
  });
  if (!parsed.success) return { error: "Nome do medicamento é obrigatório." };

  const { error } = await supabase.from("medications").insert({
    user_id: user.id,
    ...parsed.data,
  });

  if (error) return { error: error.message };

  revalidatePath("/medicacao");
  return { ok: true };
}

export async function logMedicationTaken(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const medicationId = formData.get("medication_id") as string | null;
  if (!medicationId) return { error: "Medicamento inválido." };

  const { error } = await supabase.from("medication_logs").insert({
    user_id: user.id,
    medication_id: medicationId,
    confirmed: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/medicacao");
  revalidatePath("/dashboard");
  return { ok: true };
}
