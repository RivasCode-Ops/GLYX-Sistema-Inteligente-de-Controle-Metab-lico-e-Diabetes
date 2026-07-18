import type { SupabaseClient } from "@supabase/supabase-js";
import { breakerAfterSuccess } from "@/lib/cgm/circuit-breaker";
import {
  decryptCredentialDetailed,
  encryptCredential,
  lluFetchMeasurements,
  lluFirstPatientId,
  lluLogin,
} from "@/lib/cgm/librelinkup";
import { ingestUnifiedReadings } from "@/lib/cgm/ingest";
import { normalizeLibreMeasurements } from "@/lib/cgm/normalize/libre";
import { sendPushToUser } from "@/lib/push/send";
import { isPredictedHypo, predictTrend } from "@/lib/cgm/trend";
import { evaluateGlucoseAlert } from "@/lib/insights/rules";

export type CgmConnectionRow = {
  user_id: string;
  credentials_enc: string;
  patient_id: string | null;
  last_sync_at?: string | null;
  consecutive_failures?: number | null;
  circuit_open_until?: string | null;
  last_error_kind?: string | null;
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
  let creds: { email: string; password: string };
  let usedLegacyKey = false;
  try {
    const decrypted = decryptCredentialDetailed(conn.credentials_enc);
    usedLegacyKey = decrypted.usedLegacyKey;
    creds = JSON.parse(decrypted.plain) as {
      email: string;
      password: string;
    };
  } catch {
    // Chave de criptografia rotacionada (ou payload corrompido): impossível
    // recuperar a senha — só reconectar resolve. A mensagem crua do crypto
    // ("Unsupported state...") não orienta ninguém.
    throw new Error(
      "A senha guardada ficou inválida após uma atualização de segurança do app. " +
        "Reconecte o sensor informando a senha do LibreLinkUp de novo."
    );
  }
  const session = await lluLogin(creds.email, creds.password);
  const patientId = conn.patient_id ?? (await lluFirstPatientId(session));
  const measurements = await lluFetchMeasurements(session, patientId);
  const readings = normalizeLibreMeasurements(measurements, timezone);
  const result = await ingestUnifiedReadings(supabase, conn.user_id, readings);
  if (result.error) throw new Error(result.error);

  const reset = breakerAfterSuccess();
  const connectionUpdate: {
    last_sync_at: string;
    last_error: null;
    patient_id: string;
    consecutive_failures: number;
    circuit_open_until: null;
    last_error_kind: null;
    credentials_enc?: string;
  } = {
    last_sync_at: new Date().toISOString(),
    last_error: null,
    patient_id: patientId,
    consecutive_failures: reset.consecutive_failures,
    circuit_open_until: null,
    last_error_kind: null,
  };
  // Migra cipher antigo (CRON_SECRET) → chave dedicada na próxima sync bem-sucedida.
  if (usedLegacyKey) {
    connectionUpdate.credentials_enc = encryptCredential(JSON.stringify(creds));
  }

  await supabase
    .from("cgm_connections")
    .update(connectionUpdate)
    .eq("user_id", conn.user_id)
    .eq("provider", "librelinkup");

  // Hiper/hipoglicemia na leitura mais recente do sensor → alerta persistido
  // em metabolic_alerts + push (antes só hipo era checada e nunca era
  // gravada em metabolic_alerts, só o push — que pode ser perdido).
  const latest = [...readings].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  if (latest) {
    await evaluateGlucoseAlert(
      supabase,
      conn.user_id,
      { valueMgDl: latest.valueMgDl, recordedAt: latest.recordedAt },
      "librelinkup"
    );
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
