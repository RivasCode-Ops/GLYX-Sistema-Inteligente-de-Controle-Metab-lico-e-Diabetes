import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/auth",
  "/forgot-password",
  "/reset-password",
  "/privacidade",
  "/instalar",
  "/risco",
  "/conta-desativada",
  // Recursos da PWA precisam ser públicos: navegador/instalador busca sem sessão
  "/icon",
  "/apple-icon",
  "/icon-192",
  "/icon-512",
  "/manifest",
  "/sw.js",
];

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Parameters<typeof supabaseResponse.cookies.set>[2];
        }[]
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_PREFIXES.some((p) => path.startsWith(p)) || path.startsWith("/auth");

  // Rotas de API fazem a própria autenticação (sessão ou segredo) e devolvem
  // 401 JSON — redirecionar POST para /login quebra chamadas de máquina (cron).
  if (!user && !isPublic && path !== "/" && !path.startsWith("/api/")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("disabled")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.disabled) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Conta desativada." }, { status: 403 });
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/conta-desativada";
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (user && (path === "/login" || path === "/register")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  if (path === "/" && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  if (path === "/" && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
