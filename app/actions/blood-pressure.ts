"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  systolic: z.coerce.number().int().min(50).max(300),
  diastolic: z.coerce.number().int().min(30).max(200),
  pulse: z.coerce.number().int().min(20).max(250).optional(),
});

export type ActionResult = { ok?: true; error?: string };

export async function addBloodPressureReading(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    systolic: formData.get("systolic"),
    diastolic: formData.get("diastolic"),
    pulse: formData.get("pulse") || undefined,
  });
  if (!parsed.success) return { error: "Informe sistólica e diastólica válidas." };

  const { error } = await supabase.from("blood_pressure_logs").insert({
    user_id: user.id,
    systolic: parsed.data.systolic,
    diastolic: parsed.data.diastolic,
    pulse: parsed.data.pulse ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/glicemia/pressao");
  return { ok: true };
}

export async function deleteBloodPressureReading(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Registro inválido." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("blood_pressure_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/glicemia/pressao");
  return { ok: true };
}
