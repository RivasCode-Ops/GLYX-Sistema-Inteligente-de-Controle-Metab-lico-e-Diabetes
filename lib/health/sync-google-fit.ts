import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptGoogleFitTokens,
  encryptGoogleFitTokens,
  fetchGoogleFitAggregate,
  refreshGoogleFitToken,
  type GoogleFitTokenBundle,
} from "@/lib/health/google-fit-oauth";
import { normalizeGoogleFitDaily } from "@/lib/health/google-fit";
import { ingestHealthSnapshots } from "@/lib/health/ingest";

export type GoogleFitConnectionRow = {
  user_id: string;
  tokens_enc: string;
};

const SYNC_WINDOW_DAYS = 7;

export async function syncGoogleFitConnection(
  supabase: SupabaseClient,
  conn: GoogleFitConnectionRow
): Promise<{ upserted: number }> {
  let tokens: GoogleFitTokenBundle = decryptGoogleFitTokens(conn.tokens_enc);
  let refreshed = false;

  if (tokens.expires_at < Date.now() + 60_000) {
    tokens = await refreshGoogleFitToken(tokens.refresh_token);
    refreshed = true;
  }

  const end = new Date();
  const start = new Date(end.getTime() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  let rows;
  try {
    rows = await fetchGoogleFitAggregate(tokens.access_token, start, end);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/expirado|401|revogad/i.test(msg)) {
      tokens = await refreshGoogleFitToken(tokens.refresh_token);
      refreshed = true;
      rows = await fetchGoogleFitAggregate(tokens.access_token, start, end);
    } else {
      throw e;
    }
  }

  const snapshots = normalizeGoogleFitDaily(rows);
  const result = await ingestHealthSnapshots(supabase, conn.user_id, snapshots);
  if (result.error) throw new Error(result.error);

  const update: Record<string, unknown> = {
    last_sync_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  if (refreshed) {
    update.tokens_enc = encryptGoogleFitTokens(tokens);
  }

  await supabase.from("google_fit_connections").update(update).eq("user_id", conn.user_id);

  return { upserted: result.upserted };
}
