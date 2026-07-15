import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptCredential, lluFirstPatientId, lluLogin } from "@/lib/cgm/librelinkup";
import { createClient } from "@/lib/supabase/server";

// Conecta/desconecta a conta LibreLinkUp do usuário (a mesma via que o
// médico usa para acompanhar o sensor). A senha é validada num login de
// teste e guardada cifrada; nunca é exibida de volta.

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
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
    return NextResponse.json({ error: "Informe e-mail e senha do LibreLinkUp." }, { status: 400 });
  }

  let patientId: string;
  try {
    const session = await lluLogin(parsed.data.email, parsed.data.password);
    patientId = await lluFirstPatientId(session);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao conectar ao LibreLinkUp." },
      { status: 502 }
    );
  }

  const { error } = await supabase.from("cgm_connections").upsert(
    {
      user_id: user.id,
      provider: "librelinkup",
      email: parsed.data.email,
      credentials_enc: encryptCredential(JSON.stringify(parsed.data)),
      patient_id: patientId,
      last_error: null,
      consecutive_failures: 0,
      circuit_open_until: null,
      last_error_kind: null,
    },
    { onConflict: "user_id,provider" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

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

  const { error } = await supabase
    .from("cgm_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "librelinkup");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
// Login na Abbott pode passar de 10s (redirect de região + passos de
// termos) — sem isso a Vercel corta a função e o app mostra "Erro de rede".
export const maxDuration = 60;
