import { NextResponse } from "next/server";

// Gate simples de cadastro: exige um código de convite antes do signUp.
// Não substitui fechar o "Allow signups" no dashboard do Supabase para
// quem quiser bloqueio garantido a nível de API — isto cobre o fluxo
// normal da UI.
export async function POST(req: Request) {
  const expected = process.env.SIGNUP_INVITE_CODE;
  if (!expected) {
    // Sem código configurado: cadastro segue aberto (comportamento anterior).
    return NextResponse.json({ ok: true });
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (code !== expected) {
    return NextResponse.json({ ok: false, error: "Código de convite inválido." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
