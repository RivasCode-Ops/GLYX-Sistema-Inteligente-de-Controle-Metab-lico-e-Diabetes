import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  breakerStateForCount,
  isCircuitOpen,
  type CgmErrorKind,
} from "@/lib/cgm/circuit-breaker";
import { syncDexcomConnection } from "@/lib/cgm/sync-dexcom";
import { syncLibreConnection, type CgmConnectionRow } from "@/lib/cgm/sync";
import { reportCronOutcome, reportException, reportMessage } from "@/lib/observability";

const THROTTLE_MS = 10 * 60 * 1000;

type ConnRow = CgmConnectionRow & { provider?: string | null };

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
    .select(
      "user_id, provider, credentials_enc, patient_id, last_sync_at, consecutive_failures, circuit_open_until, last_error_kind"
    );
  if (!connections?.length) {
    return NextResponse.json({ ok: true, synced: 0, failed: 0, skipped: 0, total: 0 });
  }

  const now = Date.now();
  let circuitSkipped = 0;
  const due = (connections as ConnRow[]).filter((c) => {
    if (isCircuitOpen({ circuit_open_until: c.circuit_open_until ?? null }, now)) {
      circuitSkipped += 1;
      return false;
    }
    return !c.last_sync_at || now - new Date(c.last_sync_at).getTime() >= THROTTLE_MS;
  });

  if (!due.length) {
    return NextResponse.json({
      ok: true,
      synced: 0,
      failed: 0,
      total: 0,
      skipped: connections.length,
      circuitSkipped,
    });
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
  for (const conn of due) {
    const provider = conn.provider === "dexcom" ? "dexcom" : "librelinkup";
    try {
      if (provider === "dexcom") {
        await syncDexcomConnection(supabase, conn);
      } else {
        await syncLibreConnection(supabase, conn, tzByUser.get(conn.user_id));
      }
      synced += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : "Falha na sincronização.";
      const { data: bumpedCount } = await supabase.rpc("cgm_bump_failure", {
        p_user_id: conn.user_id,
        p_provider: provider,
        p_error: msg,
      });
      const { state, kind, shouldAlertOps } = breakerStateForCount(
        bumpedCount ?? (conn.consecutive_failures ?? 0) + 1,
        msg,
        now
      );

      reportException(e, {
        tags: { job: "cgm-sync", surface: "cron", provider, error_kind: kind },
        extra: {
          userIdPrefix: conn.user_id.slice(0, 8),
          consecutive: state.consecutive_failures,
        },
        level: "error",
      });

      if (shouldAlertOps) {
        reportMessage(`CGM circuit (${provider}): ${kind} · falhas=${state.consecutive_failures}`, {
          level: "warning",
          tags: { job: "cgm-circuit", surface: "cron", provider, error_kind: kind },
          extra: {
            userIdPrefix: conn.user_id.slice(0, 8),
            openUntil: state.circuit_open_until,
            kind: kind as CgmErrorKind,
          },
        });
      }

      // last_error e consecutive_failures já foram gravados atomicamente
      // pelo cgm_bump_failure acima — aqui só falta o resto do estado do
      // breaker, que depende da contagem final retornada por ele.
      await supabase
        .from("cgm_connections")
        .update({
          circuit_open_until: state.circuit_open_until,
          last_error_kind: state.last_error_kind,
        })
        .eq("user_id", conn.user_id)
        .eq("provider", provider);
    }
  }

  await reportCronOutcome("cgm-sync", {
    synced,
    failed,
    total: due.length,
    skipped: circuitSkipped,
  });
  return NextResponse.json({
    ok: true,
    synced,
    failed,
    total: due.length,
    circuitSkipped,
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;
