import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfiguredInviteCode, inviteCodesMatch } from "@/lib/auth/invite";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(6).max(128),
  fullName: z.string().trim().max(120).optional().default(""),
  inviteCode: z.string().min(1).max(200),
  consent: z.literal(true),
});

/**
 * Cadastro invite-only via Admin API.
 * Com "Allow new users to sign up" desligado no Supabase Auth, só este
 * caminho (service role) consegue criar contas — o signUp anônimo fica bloqueado.
 */
export async function POST(req: Request) {
  const expected = getConfiguredInviteCode();
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error: "Cadastro por convite não configurado (SIGNUP_INVITE_CODE ausente).",
      },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Cadastro indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor (necessário com signup público fechado).",
      },
      { status: 503 }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados de cadastro inválidos. Verifique e-mail, senha e consentimento." },
      { status: 400 }
    );
  }

  const { email, password, fullName, inviteCode, consent } = parsed.data;
  if (!consent || !inviteCodesMatch(inviteCode, expected)) {
    return NextResponse.json({ ok: false, error: "Código de convite inválido." }, { status: 403 });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || undefined,
      privacy_consent_at: new Date().toISOString(),
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    const status = msg.includes("already") || msg.includes("registered") ? 409 : 400;
    return NextResponse.json(
      {
        ok: false,
        error:
          status === 409
            ? "Já existe uma conta com este e-mail."
            : error.message || "Não foi possível criar a conta.",
      },
      { status }
    );
  }

  return NextResponse.json({ ok: true, userId: data.user?.id ?? null });
}

export const runtime = "nodejs";
