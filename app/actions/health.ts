"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ingestHealthSnapshots } from "@/lib/health/ingest";

const schema = z.object({
  snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleep_hours: z.coerce.number().min(0).max(24),
});

export type ActionResult = { ok?: true; error?: string };

/** Entrada manual de sono — única fonte real hoje (Apple/Google Fit ainda
 * exigem sync ativo). Sobrescreve só o registro "manual" do dia; não mexe
 * em linhas de outra fonte (prioridade manual > apple > google > mock). */
export async function logManualSleep(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    snapshot_date: formData.get("snapshot_date"),
    sleep_hours: formData.get("sleep_hours"),
  });
  if (!parsed.success) return { error: "Informe uma data válida e horas entre 0 e 24." };

  const result = await ingestHealthSnapshots(supabase, user.id, [
    {
      snapshotDate: parsed.data.snapshot_date,
      source: "manual",
      steps: null,
      sleepHours: parsed.data.sleep_hours,
      restingHr: null,
      activeCalories: null,
      stressScore: null,
      metadata: null,
    },
  ]);
  if (result.error) return { error: result.error };

  revalidatePath("/integracoes");
  revalidatePath("/dashboard");
  revalidatePath("/analise");
  return { ok: true };
}
