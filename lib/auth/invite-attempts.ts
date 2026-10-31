import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Limite de tentativas de código de convite (Etapa 1, A8; GLYX-30).
 *
 * 10 falhas por hora por endereço de rede. O endereço nunca é guardado: só o
 * sha256 dele, com um prefixo fixo para não casar com hash de IP de outro lugar.
 */
export const LIMITE_FALHAS_CONVITE = 10;
export const JANELA_FALHAS_CONVITE_SEG = 60 * 60;

/** Primeiro IP de `x-forwarded-for` (a Vercel o preenche), ou `x-real-ip`. */
export function chaveDaRequisicao(headers: Headers): string {
  const encaminhado = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = encaminhado || headers.get("x-real-ip")?.trim() || "sem-ip";
  return createHash("sha256").update(`glyx-convite:${ip}`).digest("hex");
}

function funcaoAusente(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Pode tentar mais um código? Sem a migration aplicada, deixa passar
 * (comportamento anterior). Erro de banco também deixa passar: o código de
 * convite continua sendo conferido logo depois — o limite é camada extra, não
 * a única barreira, e travar o cadastro por falha de contagem não protege nada.
 */
export async function podeTentarConvite(admin: SupabaseClient, chave: string): Promise<boolean> {
  const { data, error } = await admin.rpc("convite_pode_tentar", {
    p_chave: chave,
    p_limite: LIMITE_FALHAS_CONVITE,
    p_janela_segundos: JANELA_FALHAS_CONVITE_SEG,
  });
  if (error) {
    if (!funcaoAusente(error)) console.error("[auth/register] contagem de tentativas falhou", error);
    return true;
  }
  return data !== false;
}

export async function registrarFalhaDeConvite(admin: SupabaseClient, chave: string): Promise<void> {
  const { error } = await admin.rpc("convite_registrar_falha", { p_chave: chave });
  if (error && !funcaoAusente(error)) {
    console.error("[auth/register] registro de tentativa falhou", error);
  }
}
