import { secretsMatch } from "@/lib/auth/constant-time";

/** Compara códigos de convite sem vazar tempo relativo ao tamanho/conteúdo. */
export function inviteCodesMatch(provided: string, expected: string): boolean {
  return secretsMatch(provided, expected);
}

export function getConfiguredInviteCode(): string | null {
  const code = process.env.SIGNUP_INVITE_CODE?.trim();
  return code?.length ? code : null;
}
