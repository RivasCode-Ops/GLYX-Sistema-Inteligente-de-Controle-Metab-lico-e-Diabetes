import { NextResponse } from "next/server";
import {
  encryptDexcomTokens,
  exchangeDexcomCode,
  isDexcomOAuthConfigured,
  verifyDexcomOAuthState,
} from "@/lib/cgm/dexcom";
import { createClient } from "@/lib/supabase/server";

function sensorRedirect(req: Request, query: Record<string, string>) {
  const url = new URL("/glicemia/sensor", req.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  if (!isDexcomOAuthConfigured()) {
    return sensorRedirect(req, { dexcom: "error", reason: "not_configured" });
  }

  const incoming = new URL(req.url);
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  const oauthError = incoming.searchParams.get("error");

  if (oauthError) {
    return sensorRedirect(req, { dexcom: "error", reason: oauthError });
  }
  if (!code || !state) {
    return sensorRedirect(req, { dexcom: "error", reason: "missing_code" });
  }

  const verified = verifyDexcomOAuthState(state);
  if (!verified) {
    return sensorRedirect(req, { dexcom: "error", reason: "invalid_state" });
  }

  const supabase = await createClient();
  if (!supabase) {
    return sensorRedirect(req, { dexcom: "error", reason: "supabase" });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== verified.userId) {
    return sensorRedirect(req, { dexcom: "error", reason: "session" });
  }

  try {
    const tokens = await exchangeDexcomCode(code);
    const { error } = await supabase.from("cgm_connections").upsert(
      {
        user_id: user.id,
        provider: "dexcom",
        email: null,
        credentials_enc: encryptDexcomTokens(tokens),
        patient_id: null,
        last_error: null,
        consecutive_failures: 0,
        circuit_open_until: null,
        last_error_kind: null,
      },
      { onConflict: "user_id,provider" }
    );
    if (error) {
      return sensorRedirect(req, { dexcom: "error", reason: "save" });
    }
    return sensorRedirect(req, { dexcom: "connected" });
  } catch {
    return sensorRedirect(req, { dexcom: "error", reason: "token" });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
