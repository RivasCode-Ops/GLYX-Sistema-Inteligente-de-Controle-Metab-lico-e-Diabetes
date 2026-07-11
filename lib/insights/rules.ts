import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push/send";

/** Regras simples — expandir com modelo estatístico depois */
export async function evaluateAfterGlucoseReading(
  supabase: SupabaseClient,
  userId: string,
  valueMgDl: number
): Promise<void> {
  if (valueMgDl >= 250) {
    const title = "Hiperglicemia registrada";
    const body = `Leitura ${valueMgDl} mg/dL. Monitore sintomas e siga o plano acordado com seu médico.`;
    await supabase.from("metabolic_alerts").insert({
      user_id: userId,
      severity: "warning",
      title,
      body,
      context: { type: "hyperglycemia", value: valueMgDl },
    });
    await sendPushToUser(supabase, userId, { title, body, url: "/alertas" });
  }
  if (valueMgDl < 70) {
    const title = "Possível hipoglicemia";
    const body = `Leitura ${valueMgDl} mg/dL. Se sintomas, siga protocolo e busque ajuda se necessário.`;
    await supabase.from("metabolic_alerts").insert({
      user_id: userId,
      severity: "critical",
      title,
      body,
      context: { type: "hypoglycemia", value: valueMgDl },
    });
    await sendPushToUser(supabase, userId, { title, body, url: "/alertas", critical: true });
  }
}
