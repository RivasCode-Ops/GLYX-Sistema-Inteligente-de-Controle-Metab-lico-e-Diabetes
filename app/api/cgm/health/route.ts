import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Estado de saúde da sincronização do CGM para o usuário da sessão —
// alimenta o radar do dashboard (leitura velha? sync com erro?). Sem isso,
// uma falha silenciosa (ex.: credenciais inválidas) fica invisível e o
// usuário só percebe "dado parado" sem saber a causa.

export async function GET() {
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

  const [connRes, readingRes] = await Promise.all([
    supabase
      .from("cgm_connections")
      .select("last_sync_at, last_error")
      .eq("user_id", user.id)
      .order("last_sync_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("glucose_readings")
      .select("recorded_at, value_mg_dl, source")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    connected: connRes.data != null,
    lastSyncAt: connRes.data?.last_sync_at ?? null,
    lastError: connRes.data?.last_error ?? null,
    latestReadingAt: readingRes.data?.recorded_at ?? null,
    latestReadingSource: readingRes.data?.source ?? null,
    serverTime: new Date().toISOString(),
  });
}

export const runtime = "nodejs";
