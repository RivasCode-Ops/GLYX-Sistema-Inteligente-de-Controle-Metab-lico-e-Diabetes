import { NextResponse } from "next/server";
import { buildDexcomAuthorizeUrl, isDexcomOAuthConfigured } from "@/lib/cgm/dexcom";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  if (!isDexcomOAuthConfigured()) {
    return NextResponse.json(
      { error: "Dexcom OAuth não configurado (DEXCOM_CLIENT_ID / SECRET)." },
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
    login.searchParams.set("next", "/glicemia/sensor");
    return NextResponse.redirect(login);
  }

  try {
    const url = buildDexcomAuthorizeUrl(user.id);
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao iniciar OAuth Dexcom." },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
