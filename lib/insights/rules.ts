import type { SupabaseClient } from "@supabase/supabase-js";

/** Regras simples — expandir com modelo estatístico depois */
export async function evaluateAfterGlucoseReading(
  supabase: SupabaseClient,
  userId: string,
  valueMgDl: number
): Promise<void> {
  if (valueMgDl >= 250) {
    await supabase.from("metabolic_alerts").insert({
      user_id: userId,
      severity: "warning",
      title: "Hiperglicemia registrada",
      body: `Leitura ${valueMgDl} mg/dL. Monitore sintomas e siga o plano acordado com seu médico.`,
      context: { type: "hyperglycemia", value: valueMgDl },
    });
  }
  if (valueMgDl < 70) {
    await supabase.from("metabolic_alerts").insert({
      user_id: userId,
      severity: "critical",
      title: "Possível hipoglicemia",
      body: `Leitura ${valueMgDl} mg/dL. Se sintomas, siga protocolo e busque ajuda se necessário.`,
      context: { type: "hypoglycemia", value: valueMgDl },
    });
  }
}
