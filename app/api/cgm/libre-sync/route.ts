import { NextResponse } from "next/server";
import { decryptCredential, lluFetchMeasurements, lluFirstPatientId, lluLogin } from "@/lib/cgm/librelinkup";
import { ingestUnifiedReadings } from "@/lib/cgm/ingest";
import { normalizeLibreMeasurements } from "@/lib/cgm/normalize/libre";
import { sendPushToUser } from "@/lib/push/send";
import { isPredictedHypo, predictTrend } from "@/lib/cgm/trend";
import { createClient } from "@/lib/supabase/server";

const HYPO_MG_DL = 70;

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

  if (conn.last_sync_at && Date.now() - new Date(conn.last_sync_at).getTime() < THROTTLE_MS) {
    return NextResponse.json({ ok: true, throttled: true, inserted: 0 });
  }

  try {
    const creds = JSON.parse(decryptCredential(conn.credentials_enc)) as {
      email: string;
      password: string;
    };
    const session = await lluLogin(creds.email, creds.password);
    const patientId = conn.patient_id ?? (await lluFirstPatientId(session));
    const measurements = await lluFetchMeasurements(session, patientId);
    const readings = normalizeLibreMeasurements(measurements);
    const result = await ingestUnifiedReadings(supabase, user.id, readings);
    if (result.error) throw new Error(result.error);

    await supabase
      .from("cgm_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: null, patient_id: patientId })
      .eq("user_id", user.id);

    // Hipoglicemia na leitura mais recente do sensor → push crítico
    // imediato (dedupe pelo timestamp da leitura: 1 alerta por leitura)
    const latest = [...readings].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
    if (latest && latest.valueMgDl < HYPO_MG_DL) {
      const { data: fresh } = await supabase
        .from("push_dispatch_log")
        .insert({
          user_id: user.id,
          kind: "hypo",
          ref: `libre@${latest.recordedAt}`,
          sent_on: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .maybeSingle();
      if (fresh) {
        await sendPushToUser(supabase, user.id, {
          title: "🚨 Glicemia baixa no sensor",
          body: `${latest.valueMgDl} mg/dL agora. Corrija com carboidrato rápido e meça de novo em 15 min.`,
          url: "/glicemia",
          critical: true,
        });
      }
    }

    // Alerta PREDITIVO: ainda acima de 70, mas em queda que cruza a hipo
    // em ~30 min (regressão sobre a janela recente do sensor). Dedupe por
    // leitura para não repetir a cada sync.
    const trend = predictTrend(
      readings.map((r) => ({ valueMgDl: r.valueMgDl, recordedAt: r.recordedAt }))
    );
    if (isPredictedHypo(trend)) {
      const { data: freshTrend } = await supabase
        .from("push_dispatch_log")
        .insert({
          user_id: user.id,
          kind: "hypo",
          ref: `trend@${latest?.recordedAt ?? new Date().toISOString()}`,
          sent_on: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .maybeSingle();
      if (freshTrend) {
        await sendPushToUser(supabase, user.id, {
          title: "📉 Glicemia caindo rápido",
          body: `${trend!.currentMgDl} mg/dL agora, podendo chegar a ~${Math.max(trend!.projectedMgDl, 40)} em 30 min. Considere um carboidrato rápido e fique atento.`,
          url: "/glicemia",
          critical: true,
        });
      }
    }

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
