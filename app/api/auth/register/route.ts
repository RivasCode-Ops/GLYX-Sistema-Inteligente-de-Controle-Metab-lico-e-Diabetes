import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfiguredInviteCode, inviteCodesMatch } from "@/lib/auth/invite";
import {
  chaveDaRequisicao,
  podeTentarConvite,
  registrarFalhaDeConvite,
} from "@/lib/auth/invite-attempts";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(6).max(128),
  fullName: z.string().trim().max(120).optional().default(""),
  inviteCode: z.string().min(1).max(200),
  consent: z.literal(true),
});

/**
 * Mesma frase para "e-mail já cadastrado" e qualquer outra recusa do Auth (Etapa
 * 1, A8): antes, o 409 "Já existe uma conta com este e-mail" dizia a quem
 * tivesse o convite quem usa o app, e os demais erros devolviam a mensagem crua
 * do Supabase.
 */
const RECUSA_NEUTRA =
  "Não foi possível criar a conta com esses dados. Se você já tem conta, entre pelo login ou use “Esqueci a senha”.";

/**
 * Cadastro invite-only via Admin API.
 * Com "Allow new users to sign up" desligado no Supabase Auth, só este
 * caminho (service role) consegue criar contas — o signUp anônimo fica bloqueado.
 *
 * Ordem (Etapa 1, A8): limite de tentativas → código → criação. O código é
 * conferido mesmo sem service role, para a recusa não depender de configuração.
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

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados de cadastro inválidos. Verifique e-mail, senha e consentimento." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const chave = chaveDaRequisicao(req.headers);

  if (admin && !(await podeTentarConvite(admin, chave))) {
    return NextResponse.json(
      { ok: false, error: "Muitas tentativas de código de convite. Tente de novo em uma hora." },
      { status: 429 }
    );
  }

  const { email, password, fullName, inviteCode, consent } = parsed.data;
  if (!consent || !inviteCodesMatch(inviteCode, expected)) {
    if (admin) await registrarFalhaDeConvite(admin, chave);
    return NextResponse.json({ ok: false, error: "Código de convite inválido." }, { status: 403 });
  }

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
    console.error("[auth/register] criação recusada pelo Auth", { code: error.code, status: error.status });
    return NextResponse.json({ ok: false, error: RECUSA_NEUTRA }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId: data.user?.id ?? null });
}

export const runtime = "nodejs";
