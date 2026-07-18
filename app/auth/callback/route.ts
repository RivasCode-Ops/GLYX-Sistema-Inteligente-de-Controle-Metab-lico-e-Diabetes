import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth/allowlist";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Evita open-redirect: só caminhos internos relativos.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Login social (Google/Apple) cria conta na hora, sem passar pelo
        // gate de convite do cadastro por e-mail/senha — barra aqui.
        if (!isAllowedEmail(data.user?.email)) {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/login?error=not_allowed`);
        }
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
