"use server";

import { revalidatePath } from "next/cache";
import { persistFindings, runCorrelationEngine } from "@/lib/insights/v2/engine";
import { createClient } from "@/lib/supabase/server";

export type InsightsActionResult = {
  ok?: true;
  upserted?: number;
  generated?: number;
  error?: string;
};

export async function refreshCorrelationInsights(windowDays: number = 14): Promise<InsightsActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const findings = await runCorrelationEngine(supabase, user.id, windowDays);
  const saved = await persistFindings(supabase, user.id, findings);

  if (saved.error) return { error: saved.error };

  revalidatePath("/analise/correlacoes");
  revalidatePath("/dashboard");
  return {
    ok: true,
    upserted: saved.upserted,
    generated: findings.length,
  };
}
