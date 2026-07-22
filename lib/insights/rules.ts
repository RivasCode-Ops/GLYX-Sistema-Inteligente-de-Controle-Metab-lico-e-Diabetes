import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push/send";
import { hypoThresholdFor } from "@/lib/health/glucose-thresholds";

const HYPER_MG_DL = 250;
/** Faixa acima da meta mínima que ainda merece um aviso preventivo (não crítico). */
const NEAR_LOW_BUFFER_MG_DL = 10;

export type GlucoseAlertSource = "manual" | "librelinkup" | "dexcom";

/**
 * Avalia hiper/hipoglicemia (e agora também "no limite inferior") para UMA
 * leitura — usada tanto pelo registro manual quanto pela sincronização
 * automática do sensor (Libre/Dexcom), que antes só checava hipo com
 * limiar fixo e nunca gravava em metabolic_alerts (só push, que pode ser
 * perdido). Usa a meta pessoal (target_glucose_min do perfil) em vez de
 * 70 fixo — antes, várias leituras seguidas em 70-79 (dentro da meta
 * "oficial" mas claramente baixas) não geravam nenhum aviso.
 *
 * Dedup por leitura específica via push_dispatch_log para hipo/hiper (não
 * repetir o mesmo evento a cada sync de 15 min); dedup por DIA para o aviso
 * "no limite", que é preventivo e repetiria demais se fosse por leitura
 * enquanto a glicemia oscila nessa faixa.
 */
export async function evaluateGlucoseAlert(
  supabase: SupabaseClient,
  userId: string,
  reading: { valueMgDl: number; recordedAt: string },
  source: GlucoseAlertSource
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("target_glucose_min")
    .eq("id", userId)
    .maybeSingle();
  const hypoThreshold = hypoThresholdFor(profile?.target_glucose_min);

  const kind: "hyperglycemia" | "hypoglycemia" | "near_low" | null =
    reading.valueMgDl >= HYPER_MG_DL
      ? "hyperglycemia"
      : reading.valueMgDl < hypoThreshold
        ? "hypoglycemia"
        : reading.valueMgDl < hypoThreshold + NEAR_LOW_BUFFER_MG_DL
          ? "near_low"
          : null;
  if (!kind) return;

  const dedupeRef =
    kind === "near_low"
      ? `near_low@${source}` // 1x por dia (sent_on já isola o dia)
      : `${kind}@${source}@${reading.recordedAt}`;

  const { data: fresh } = await supabase
    .from("push_dispatch_log")
    .insert({
      user_id: userId,
      kind: "metabolic_alert",
      ref: dedupeRef,
      sent_on: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .maybeSingle();
  if (!fresh) return;

  const severity = kind === "hypoglycemia" ? "critical" : kind === "near_low" ? "info" : "warning";
  const title =
    kind === "hypoglycemia"
      ? "Possível hipoglicemia"
      : kind === "near_low"
        ? "Glicemia no limite inferior"
        : "Hiperglicemia registrada";
  const body =
    kind === "hypoglycemia"
      ? `${reading.valueMgDl} mg/dL. Corrija com carboidrato rápido e meça de novo em 15 min; busque ajuda se os sintomas persistirem.`
      : kind === "near_low"
        ? `${reading.valueMgDl} mg/dL — perto do limite inferior da meta. Considere um lanche leve com carboidrato e monitore de perto nos próximos minutos.`
        : `Leitura ${reading.valueMgDl} mg/dL. Monitore sintomas e siga o plano acordado com seu médico.`;

  await supabase.from("metabolic_alerts").insert({
    user_id: userId,
    severity,
    title,
    body,
    context: { type: kind, value: reading.valueMgDl, source },
  });
  await sendPushToUser(supabase, userId, {
    title,
    body,
    url: "/analise/alertas",
    critical: kind === "hypoglycemia",
  });
}
