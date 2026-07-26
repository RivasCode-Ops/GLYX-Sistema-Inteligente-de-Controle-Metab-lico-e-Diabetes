import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveGlucoseTargets, type GlucoseTargets } from "@/lib/health/glucose-thresholds";

/**
 * Lê a faixa-alvo do perfil já resolvida (com fallback para o padrão).
 *
 * Existe para os caminhos que precisam SÓ dos limiares — sync de CGM e
 * avaliação de alerta. Quem já consulta `profiles` por outro motivo (dashboard,
 * day-grid, relatório) deve continuar com a própria query e passar a linha para
 * `resolveGlucoseTargets`, em vez de gastar um round trip a mais.
 */
export async function loadGlucoseTargets(
  supabase: SupabaseClient,
  userId: string
): Promise<GlucoseTargets> {
  const { data } = await supabase
    .from("profiles")
    .select("target_glucose_min, target_glucose_max")
    .eq("id", userId)
    .maybeSingle();
  return resolveGlucoseTargets(data);
}
