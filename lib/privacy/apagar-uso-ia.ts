import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Decisão D4 (aprovada em 15/10/2026): a exclusão apaga TODO o histórico de uso
 * de IA da pessoa. Quem apaga é o servidor, com a chave de serviço, e só aqui,
 * dentro da exclusão completa — o usuário não tem como apagar `ai_usage` à
 * parte (a policy é só leitura desde GLYX-24), senão zeraria a cota por hora
 * sem perder mais nada. Consequência aceita: a exclusão reinicia a cota
 * individual. Funciona com o banco antes ou depois da migration (a chave de
 * serviço não passa por RLS). Sem a chave, a exclusão avisa em vez de dizer
 * que apagou tudo.
 */
export async function apagarUsoDeIa(
  admin: SupabaseClient | null,
  userId: string
): Promise<string | null> {
  if (!admin) return "Falha ao apagar o histórico de uso de IA.";
  const { error } = await admin.from("ai_usage").delete().eq("user_id", userId);
  return error ? "Falha ao apagar o histórico de uso de IA." : null;
}
