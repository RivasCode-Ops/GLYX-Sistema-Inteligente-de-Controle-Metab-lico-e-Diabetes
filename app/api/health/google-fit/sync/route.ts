import { NextResponse } from "next/server";
import { syncGoogleFitConnection } from "@/lib/health/sync-google-fit";
import { createClient } from "@/lib/supabase/server";

const THROTTLE_MS = 5 * 60 * 1000;

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { data: conn } = await supabase
    .from("google_fit_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: "Google Fit não conectado." }, { status: 404 });
  }

  if (conn.last_sync_at && Date.now() - new Date(conn.last_sync_at).getTime() < THROTTLE_MS) {
    return NextResponse.json({ ok: true, throttled: true, upserted: 0 });
  }

  try {
    const result = await syncGoogleFitConnection(supabase, conn);
    return NextResponse.json({ ok: true, upserted: result.upserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na sincronização Google Fit.";
    await supabase.from("google_fit_connections").update({ last_error: msg }).eq("user_id", user.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
