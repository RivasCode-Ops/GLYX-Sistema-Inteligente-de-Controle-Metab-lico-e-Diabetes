/** Mensagens amigáveis para erros do Supabase Auth (PT-BR). */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();

  if (
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("email rate limit") ||
    m.includes("over_email_send_rate_limit") ||
    m.includes("429")
  ) {
    return "Muitas tentativas em pouco tempo. Aguarde 15–60 minutos e tente de novo, ou use o link “Esqueci minha senha”.";
  }

  if (m.includes("same") || m.includes("different from the old")) {
    return "A nova senha precisa ser diferente da atual.";
  }

  if (
    m.includes("invalid login") ||
    m.includes("invalid credentials") ||
    m.includes("invalid email or password")
  ) {
    return "Senha atual incorreta.";
  }

  if (m.includes("weak") || m.includes("at least") || m.includes("password should")) {
    return "Senha fraca demais. Use no mínimo 6 caracteres.";
  }

  if (
    m.includes("session") ||
    m.includes("not authenticated") ||
    m.includes("jwt") ||
    m.includes("refresh_token")
  ) {
    return "Sessão expirada. Saia e entre de novo.";
  }

  if (m.includes("user not found")) {
    return "Conta não encontrada para este e-mail.";
  }

  return message;
}
