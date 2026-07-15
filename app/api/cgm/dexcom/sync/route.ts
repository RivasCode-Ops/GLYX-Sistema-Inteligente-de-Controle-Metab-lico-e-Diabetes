import { NextResponse } from "next/server";
import { breakerAfterFailure, isCircuitOpen } from "@/lib/cgm/circuit-breaker";
import { syncDexcomConnection } from "@/lib/cgm/sync-dexcom";
import { reportException } from "@/lib/observability";
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
    .from("cgm_connections")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "dexcom")
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: "Dexcom não conectado." }, { status: 404 });
  }

  if (conn.last_sync_at && Date.now() - new Date(conn.last_sync_at).getTime() < THROTTLE_MS) {
    return NextResponse.json({
      ok: true,
      throttled: true,
      inserted: 0,
      circuitOpen: isCircuitOpen({ circuit_open_until: conn.circuit_open_until }),
    });
  }

  try {
    const result = await syncDexcomConnection(supabase, conn);
    return NextResponse.json({ ok: true, inserted: result.inserted, skipped: result.skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na sincronização Dexcom.";
    const { state, kind } = breakerAfterFailure(
      { consecutive_failures: conn.consecutive_failures ?? 0 },
      msg
    );
    reportException(e, {
      tags: { job: "cgm-sync", surface: "user", provider: "dexcom", error_kind: kind },
      extra: { userIdPrefix: user.id.slice(0, 8) },
      level: "error",
    });
    await supabase
      .from("cgm_connections")
      .update({
        last_error: msg,
        consecutive_failures: state.consecutive_failures,
        circuit_open_until: state.circuit_open_until,
        last_error_kind: state.last_error_kind,
      })
      .eq("user_id", user.id)
      .eq("provider", "dexcom");
    return NextResponse.json(
      { error: msg, circuitOpenUntil: state.circuit_open_until, errorKind: kind },
      { status: 502 }
    );
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
