import { NextResponse } from "next/server";
import {
  encryptGoogleFitTokens,
  exchangeGoogleFitCode,
  isGoogleFitOAuthConfigured,
  verifyGoogleFitOAuthState,
} from "@/lib/health/google-fit-oauth";
import { createClient } from "@/lib/supabase/server";

function integracoesRedirect(req: Request, query: Record<string, string>) {
  const url = new URL("/integracoes", req.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  if (!isGoogleFitOAuthConfigured()) {
    return integracoesRedirect(req, { googleFit: "error", reason: "not_configured" });
  }

  const incoming = new URL(req.url);
  const code = incoming.searchParams.get("code");
  const state = incoming.searchParams.get("state");
  const oauthError = incoming.searchParams.get("error");

  if (oauthError) {
    return integracoesRedirect(req, { googleFit: "error", reason: oauthError });
  }
  if (!code || !state) {
    return integracoesRedirect(req, { googleFit: "error", reason: "missing_code" });
  }

  const verified = verifyGoogleFitOAuthState(state);
  if (!verified) {
    return integracoesRedirect(req, { googleFit: "error", reason: "invalid_state" });
  }

  const supabase = await createClient();
  if (!supabase) {
    return integracoesRedirect(req, { googleFit: "error", reason: "supabase" });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== verified.userId) {
    return integracoesRedirect(req, { googleFit: "error", reason: "session" });
  }

  try {
    const tokens = await exchangeGoogleFitCode(code);
    const { error } = await supabase.from("google_fit_connections").upsert(
      {
        user_id: user.id,
        tokens_enc: encryptGoogleFitTokens(tokens),
        last_error: null,
      },
      { onConflict: "user_id" }
    );
    if (error) {
      return integracoesRedirect(req, { googleFit: "error", reason: "save" });
    }
    return integracoesRedirect(req, { googleFit: "connected" });
  } catch (e) {
    const reason = e instanceof Error && /refresh_token/.test(e.message) ? "no_refresh_token" : "token";
    return integracoesRedirect(req, { googleFit: "error", reason });
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;
