import { NextResponse } from "next/server";
import { buildGoogleFitAuthorizeUrl, isGoogleFitOAuthConfigured } from "@/lib/health/google-fit-oauth";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  if (!isGoogleFitOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google Fit OAuth não configurado (GOOGLE_FIT_CLIENT_ID / SECRET)." },
      { status: 503 }
    );
  }
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", "/integracoes");
    return NextResponse.redirect(login);
  }

  try {
    const url = buildGoogleFitAuthorizeUrl(user.id);
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao iniciar OAuth Google Fit." },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
