"use server";

import { revalidatePath } from "next/cache";
import {
  listMetabolicAudits,
  persistMetabolicAudit,
  runMetabolicAudit,
} from "@/lib/audit/run";
import type { MetabolicAuditReport, MetabolicAuditRow } from "@/lib/audit/types";
import { createClient } from "@/lib/supabase/server";

export type AuditActionResult = {
  ok?: true;
  error?: string;
  report?: MetabolicAuditReport;
  id?: string | null;
};

export async function generateMetabolicAudit(windowDays: number = 14): Promise<AuditActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const report = await runMetabolicAudit(supabase, user.id, windowDays);
  const saved = await persistMetabolicAudit(supabase, user.id, report);
  if (saved.error) return { error: saved.error };

  revalidatePath("/analise");
  revalidatePath("/dashboard");
  return { ok: true, report, id: saved.id };
}

export async function getMetabolicAuditHistory(limit: number = 10): Promise<MetabolicAuditRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return listMetabolicAudits(supabase, user.id, limit);
}
