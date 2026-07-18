/**
 * Login social (Google/Apple) cria conta automaticamente no primeiro
 * acesso, ignorando o gate de convite usado no cadastro por e-mail/senha
 * (app/api/auth/register/route.ts). Esta allowlist é a única barreira
 * contra qualquer conta Google/Apple entrar no app.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = process.env.ALLOWED_EMAILS?.split(",").map((e) => e.trim().toLowerCase()) ?? [];
  return allowed.includes(email.trim().toLowerCase());
}
