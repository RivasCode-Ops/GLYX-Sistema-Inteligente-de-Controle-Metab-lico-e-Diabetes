import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Desconecta a conta Google Fit do usuário. */
export async function DELETE() {
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

  const { error } = await supabase.from("google_fit_connections").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
