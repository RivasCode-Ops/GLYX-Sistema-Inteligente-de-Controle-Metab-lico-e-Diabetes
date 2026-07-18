import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push/send";

const HYPER_MG_DL = 250;
const HYPO_MG_DL = 70;

export type GlucoseAlertSource = "manual" | "librelinkup" | "dexcom";

/**
 * Avalia hiper/hipoglicemia para UMA leitura — usada tanto pelo registro
 * manual quanto pela sincronização automática do sensor (Libre/Dexcom), que
 * antes só checava hipo e nunca gravava em metabolic_alerts (só push, que
 * pode ser perdido). Dedup por leitura específica via push_dispatch_log:
 * sem isso, o sync do sensor rodando a cada 15 min re-alertaria a MESMA
 * leitura repetidamente enquanto ela continuasse sendo "a mais recente"
 * (ex.: sensor sem dado novo por horas).
 */
export async function evaluateGlucoseAlert(
  supabase: SupabaseClient,
  userId: string,
  reading: { valueMgDl: number; recordedAt: string },
  source: GlucoseAlertSource
): Promise<void> {
  const kind: "hyperglycemia" | "hypoglycemia" | null =
    reading.valueMgDl >= HYPER_MG_DL
      ? "hyperglycemia"
      : reading.valueMgDl < HYPO_MG_DL
        ? "hypoglycemia"
        : null;
  if (!kind) return;

  const { data: fresh } = await supabase
    .from("push_dispatch_log")
    .insert({
      user_id: userId,
      kind: "metabolic_alert",
      ref: `${kind}@${source}@${reading.recordedAt}`,
      sent_on: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .maybeSingle();
  if (!fresh) return;

  const severity = kind === "hypoglycemia" ? "critical" : "warning";
  const title = kind === "hypoglycemia" ? "Possível hipoglicemia" : "Hiperglicemia registrada";
  const body =
    kind === "hypoglycemia"
      ? `${reading.valueMgDl} mg/dL. Corrija com carboidrato rápido e meça de novo em 15 min; busque ajuda se os sintomas persistirem.`
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
    url: "/alertas",
    critical: kind === "hypoglycemia",
  });
}
