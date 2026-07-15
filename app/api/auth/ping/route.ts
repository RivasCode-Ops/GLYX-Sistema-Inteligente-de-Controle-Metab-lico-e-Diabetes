import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Checagem leve de sessão para o SessionGuard do cliente: 204 se a sessão
// está viva (renova o token de acesso se preciso), 401 se morreu. Sem isso,
// um PWA aberto há dias vira "zumbi": mostra tela antiga e todo botão que
// fala com o servidor falha em silêncio.

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse(null, { status: 401 });
  }
  return new NextResponse(null, { status: 204 });
}

export const runtime = "nodejs";
