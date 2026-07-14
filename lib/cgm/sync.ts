import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptCredential, lluFetchMeasurements, lluFirstPatientId, lluLogin } from "@/lib/cgm/librelinkup";
import { ingestUnifiedReadings } from "@/lib/cgm/ingest";
import { normalizeLibreMeasurements } from "@/lib/cgm/normalize/libre";
import { sendPushToUser } from "@/lib/push/send";
import { isPredictedHypo, predictTrend } from "@/lib/cgm/trend";

const HYPO_MG_DL = 70;

export type CgmConnectionRow = {
  user_id: string;
  credentials_enc: string;
  patient_id: string | null;
};

/**
 * Login no LibreLinkUp, busca as leituras recentes, normaliza no fuso do
 * usuário e ingere — usado tanto pela sincronização disparada pelo cliente
 * (sessão do usuário) quanto pelo dispatcher de cron (service role, todos
 * os usuários). Também dispara os pushes de hipoglicemia/tendência.
 */
export async function syncLibreConnection(
  supabase: SupabaseClient,
  conn: CgmConnectionRow,
  timezone: string | null | undefined
): Promise<{ inserted: number; skipped: number; patientId: string }> {
  const creds = JSON.parse(decryptCredential(conn.credentials_enc)) as {
    email: string;
    password: string;
  };
  const session = await lluLogin(creds.email, creds.password);
  const patientId = conn.patient_id ?? (await lluFirstPatientId(session));
  const measurements = await lluFetchMeasurements(session, patientId);
  const readings = normalizeLibreMeasurements(measurements, timezone);
  const result = await ingestUnifiedReadings(supabase, conn.user_id, readings);
  if (result.error) throw new Error(result.error);

  await supabase
    .from("cgm_connections")
    .update({ last_sync_at: new Date().toISOString(), last_error: null, patient_id: patientId })
    .eq("user_id", conn.user_id);

  // Hipoglicemia na leitura mais recente do sensor → push crítico imediato
  // (dedupe pelo timestamp da leitura: 1 alerta por leitura).
  const latest = [...readings].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  if (latest && latest.valueMgDl < HYPO_MG_DL) {
    const { data: fresh } = await supabase
      .from("push_dispatch_log")
      .insert({
        user_id: conn.user_id,
        kind: "hypo",
        ref: `libre@${latest.recordedAt}`,
        sent_on: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .maybeSingle();
    if (fresh) {
      await sendPushToUser(supabase, conn.user_id, {
        title: "🚨 Glicemia baixa no sensor",
        body: `${latest.valueMgDl} mg/dL agora. Corrija com carboidrato rápido e meça de novo em 15 min.`,
        url: "/glicemia",
        critical: true,
      });
    }
  }

  // Alerta PREDITIVO: ainda acima de 70, mas em queda que cruza a hipo em
  // ~30 min. Dedupe por leitura para não repetir a cada sync.
  const trend = predictTrend(readings.map((r) => ({ valueMgDl: r.valueMgDl, recordedAt: r.recordedAt })));
  if (isPredictedHypo(trend)) {
    const { data: freshTrend } = await supabase
      .from("push_dispatch_log")
      .insert({
        user_id: conn.user_id,
        kind: "hypo",
        ref: `trend@${latest?.recordedAt ?? new Date().toISOString()}`,
        sent_on: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .maybeSingle();
    if (freshTrend) {
      await sendPushToUser(supabase, conn.user_id, {
        title: "📉 Glicemia caindo rápido",
        body: `${trend!.currentMgDl} mg/dL agora, podendo chegar a ~${Math.max(trend!.projectedMgDl, 40)} em 30 min. Considere um carboidrato rápido e fique atento.`,
        url: "/glicemia",
        critical: true,
      });
    }
  }

  return { inserted: result.inserted, skipped: result.skipped, patientId };
}
