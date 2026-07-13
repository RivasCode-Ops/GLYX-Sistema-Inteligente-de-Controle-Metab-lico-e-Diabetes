import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Chamado pelo service worker quando o usuário toca "Adiar" na notificação
// de alarme — agenda um novo aviso em N minutos, sem exigir abrir o app.

const schema = z.object({
  medication_id: z.string().uuid(),
  minutes: z.number().int().min(1).max(120).optional(),
});

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

  const { data: med } = await supabase
    .from("medications")
    .select("id")
    .eq("id", parsed.data.medication_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!med) {
    return NextResponse.json({ error: "Medicamento não encontrado." }, { status: 404 });
  }

  const minutes = parsed.data.minutes ?? 15;
  const snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString();

  const { error } = await supabase.from("medication_snoozes").insert({
    user_id: user.id,
    medication_id: med.id,
    snoozed_until: snoozedUntil,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snoozedUntil });
}

export const runtime = "nodejs";
