import type { SupabaseClient } from "@supabase/supabase-js";
import { breakerAfterSuccess } from "@/lib/cgm/circuit-breaker";
import {
  decryptDexcomTokens,
  encryptDexcomTokens,
  fetchDexcomEgvs,
  refreshDexcomToken,
} from "@/lib/cgm/dexcom";
import { ingestUnifiedReadings } from "@/lib/cgm/ingest";
import { sendPushToUser } from "@/lib/push/send";
import { isPredictedHypo, predictTrend } from "@/lib/cgm/trend";
import type { CgmConnectionRow } from "@/lib/cgm/sync";

const HYPO_MG_DL = 70;

export async function syncDexcomConnection(
  supabase: SupabaseClient,
  conn: CgmConnectionRow
): Promise<{ inserted: number; skipped: number }> {
  let tokens = decryptDexcomTokens(conn.credentials_enc);
  let refreshed = false;

  if (tokens.expires_at < Date.now() + 60_000) {
    tokens = await refreshDexcomToken(tokens.refresh_token);
    refreshed = true;
  }

  let readings;
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    readings = await fetchDexcomEgvs(tokens.access_token, start, end);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/expirado|401|revogad/i.test(msg)) {
      tokens = await refreshDexcomToken(tokens.refresh_token);
      refreshed = true;
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      readings = await fetchDexcomEgvs(tokens.access_token, start, end);
    } else {
      throw e;
    }
  }

  const result = await ingestUnifiedReadings(supabase, conn.user_id, readings);
  if (result.error) throw new Error(result.error);

  const reset = breakerAfterSuccess();
  const update: Record<string, unknown> = {
    last_sync_at: new Date().toISOString(),
    last_error: null,
    consecutive_failures: reset.consecutive_failures,
    circuit_open_until: null,
    last_error_kind: null,
  };
  if (refreshed) {
    update.credentials_enc = encryptDexcomTokens(tokens);
  }

  await supabase
    .from("cgm_connections")
    .update(update)
    .eq("user_id", conn.user_id)
    .eq("provider", "dexcom");

  const latest = [...readings].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
  if (latest && latest.valueMgDl < HYPO_MG_DL) {
    const { data: fresh } = await supabase
      .from("push_dispatch_log")
      .insert({
        user_id: conn.user_id,
        kind: "hypo",
        ref: `dexcom@${latest.recordedAt}`,
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

  const trend = predictTrend(
    readings.map((r) => ({ valueMgDl: r.valueMgDl, recordedAt: r.recordedAt }))
  );
  if (isPredictedHypo(trend)) {
    const { data: freshTrend } = await supabase
      .from("push_dispatch_log")
      .insert({
        user_id: conn.user_id,
        kind: "hypo",
        ref: `dexcom-trend@${latest?.recordedAt ?? new Date().toISOString()}`,
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

  return { inserted: result.inserted, skipped: result.skipped };
}
