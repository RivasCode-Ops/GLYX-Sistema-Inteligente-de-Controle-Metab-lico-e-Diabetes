import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Chamado pelo service worker quando o usuário toca "Já tomei" na
// notificação de alarme — registra a dose sem abrir o app.

const schema = z.object({ medication_id: z.string().uuid() });

export async function POST(req: Request) {
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

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  // Garante que o medicamento é do usuário antes de registrar
  const { data: med } = await supabase
    .from("medications")
    .select("id")
    .eq("id", parsed.data.medication_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!med) {
    return NextResponse.json({ error: "Medicamento não encontrado." }, { status: 404 });
  }

  const { error } = await supabase.from("medication_logs").insert({
    user_id: user.id,
    medication_id: med.id,
    confirmed: true,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
