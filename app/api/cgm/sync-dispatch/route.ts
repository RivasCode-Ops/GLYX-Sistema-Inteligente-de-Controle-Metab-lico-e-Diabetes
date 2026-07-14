import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { syncLibreConnection, type CgmConnectionRow } from "@/lib/cgm/sync";

// Chamado pelo pg_cron do Supabase (sem sessão de usuário) para sincronizar
// TODAS as conexões LibreLinkUp em segundo plano — diferente de
// /api/cgm/libre-sync (sessão de um único usuário, disparado do navegador).
// Precisa da service role key porque decripta credenciais e grava
// glucose_readings de qualquer usuário, sem RLS de um usuário logado.

const THROTTLE_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Service role não configurada no servidor." }, { status: 503 });
  }
  const supabase = createServiceClient(url, serviceKey);

  const { data: connections } = await supabase
    .from("cgm_connections")
    .select("user_id, credentials_enc, patient_id, last_sync_at");
  if (!connections?.length) {
    return NextResponse.json({ ok: true, synced: 0, failed: 0, total: 0 });
  }

  const due = connections.filter(
    (c) => !c.last_sync_at || Date.now() - new Date(c.last_sync_at).getTime() >= THROTTLE_MS
  );
  if (!due.length) {
    return NextResponse.json({ ok: true, synced: 0, failed: 0, total: 0, skipped: connections.length });
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, timezone")
    .in(
      "id",
      due.map((c) => c.user_id)
    );
  const tzByUser = new Map((profiles ?? []).map((p) => [p.id, p.timezone]));

  let synced = 0;
  let failed = 0;
  for (const conn of due as CgmConnectionRow[]) {
    try {
      await syncLibreConnection(supabase, conn, tzByUser.get(conn.user_id));
      synced += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : "Falha na sincronização.";
      await supabase.from("cgm_connections").update({ last_error: msg }).eq("user_id", conn.user_id);
    }
  }

  return NextResponse.json({ ok: true, synced, failed, total: due.length });
}

export const runtime = "nodejs";
export const maxDuration = 60;
