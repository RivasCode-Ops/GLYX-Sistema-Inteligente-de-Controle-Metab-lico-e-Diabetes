import { NextResponse } from "next/server";
import { syncLibreConnection } from "@/lib/cgm/sync";
import { createClient } from "@/lib/supabase/server";

// Sincroniza as leituras do FreeStyle Libre via LibreLinkUp para o
// usuário da sessão. Chamado pelo botão "Sincronizar" e automaticamente
// ao abrir o painel (com trava de 5 min para não abusar da API).

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
    .from("cgm_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: "Sensor não conectado." }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  if (conn.last_sync_at && Date.now() - new Date(conn.last_sync_at).getTime() < THROTTLE_MS) {
    return NextResponse.json({ ok: true, throttled: true, inserted: 0 });
  }

  try {
    const result = await syncLibreConnection(supabase, conn, profile?.timezone);
    return NextResponse.json({ ok: true, inserted: result.inserted, skipped: result.skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na sincronização.";
    await supabase
      .from("cgm_connections")
      .update({ last_error: msg })
      .eq("user_id", user.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
