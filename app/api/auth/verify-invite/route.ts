import { NextResponse } from "next/server";
import { getConfiguredInviteCode, inviteCodesMatch } from "@/lib/auth/invite";

// Gate de pré-checagem do código (UX). O cadastro real valida de novo em /api/auth/register.
export async function POST(req: Request) {
  const expected = getConfiguredInviteCode();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Cadastro por convite não configurado (SIGNUP_INVITE_CODE ausente)." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";

  if (!inviteCodesMatch(code, expected)) {
    return NextResponse.json({ ok: false, error: "Código de convite inválido." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
