/**
 * Erro do banco → frase para a tela (GLYX-32 / P24).
 *
 * As actions e rotas devolviam `error.message` do PostgREST direto ao
 * navegador: `new row violates row-level security policy for table
 * "medication_logs"`, nome de constraint, nome de coluna. Para quem usa, é
 * ruído em inglês; para quem sonda, é o mapa do schema e das policies.
 *
 * O erro completo vai para o log do servidor (e daí para o Sentry), onde serve
 * a quem corrige. A tela recebe uma frase que diz o que fazer.
 */
export type DbErrorLike = { message?: string; code?: string } | null | undefined;

export function publicDbErrorMessage(error: DbErrorLike): string {
  const code = error?.code ?? "";
  const msg = error?.message ?? "";

  if (code === "23505") return "Já existe um registro igual a este.";
  if (["23514", "23502", "22P02", "22003", "22007", "22008"].includes(code)) {
    return "Algum valor está fora do permitido. Confira os campos e tente de novo.";
  }
  if (code === "23503") return "O item relacionado não existe mais. Atualize a página e tente de novo.";
  // RLS: inclui conta desativada, que é barrada pelas policies desde o lote 1.
  if (code === "42501" || /row-level security/i.test(msg)) {
    return "Sua conta não tem permissão para esta operação agora. Se o problema continuar, fale com o suporte.";
  }
  if (code === "PGRST301" || /jwt expired/i.test(msg)) return "Sua sessão expirou. Entre de novo.";
  return "Não foi possível concluir agora. Tente de novo em instantes.";
}

/** Registra o erro completo no servidor e devolve a frase pública. */
export function publicDbError(error: DbErrorLike, contexto: string): string {
  console.error(`[${contexto}]`, error);
  return publicDbErrorMessage(error);
}
