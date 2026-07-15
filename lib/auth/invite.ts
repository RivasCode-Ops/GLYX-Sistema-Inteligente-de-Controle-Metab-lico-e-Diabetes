import { createHash, timingSafeEqual } from "crypto";

/** Compara códigos de convite sem vazar tempo relativo ao tamanho/conteúdo. */
export function inviteCodesMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided.trim()).digest();
  const b = createHash("sha256").update(expected.trim()).digest();
  return timingSafeEqual(a, b);
}

export function getConfiguredInviteCode(): string | null {
  const code = process.env.SIGNUP_INVITE_CODE?.trim();
  return code?.length ? code : null;
}
