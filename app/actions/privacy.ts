"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PrivacyActionResult = { ok?: true; error?: string };

// Direito de eliminação (LGPD): apaga todos os registros do usuário.
// A conta (login) permanece; exclusão da conta em si é feita pelo contato do responsável.
// Ordem respeita as FKs: ai_threads cascateia ai_messages; logs antes de medications.
const TABLES_IN_ORDER = [
  "ai_threads",
  "medication_logs",
  "medications",
  "glucose_readings",
  "meals",
  "exercise_sessions",
  "metabolic_alerts",
  "exams",
  "health_snapshots",
  "insight_findings",
  "ai_usage",
] as const;

export async function deleteAllMyData(): Promise<PrivacyActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  for (const table of TABLES_IN_ORDER) {
    const { error } = await supabase.from(table).delete().eq("user_id", user.id);
    if (error) return { error: `Falha ao apagar ${table}: ${error.message}` };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
