import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST: a função chamada não existe no schema (migration ainda não aplicada). */
const FUNCAO_INEXISTENTE = "PGRST202";

export type ResultadoDesativar = "ok" | "sem_permissao" | "falha_alterar";

/**
 * Marca `profiles.disabled` de outra conta (GLYX-18).
 *
 * Caminho novo: a RPC `admin_definir_conta_desativada`, que confere admin por
 * dentro e mexe só nessa coluna — as policies que davam ao admin leitura e
 * escrita do perfil inteiro saem na mesma migration.
 *
 * Recuo: até a migration `20261030140000` ser aplicada a RPC não existe, e o
 * caminho antigo (UPDATE sob a policy `profiles_update_admin`) continua valendo.
 * O código vai ANTES da migration; os dois estados funcionam. Fora de
 * `app/actions` de propósito: exportada de um arquivo "use server", viraria
 * uma action chamável pelo navegador.
 */
export async function definirContaDesativada(
  supabase: SupabaseClient,
  alvo: string,
  desativada: boolean
): Promise<ResultadoDesativar> {
  const { data, error } = await supabase.rpc("admin_definir_conta_desativada", {
    p_alvo: alvo,
    p_desativada: desativada,
  });
  if (!error) return data === true ? "ok" : "falha_alterar";
  if (error.code === "42501") return "sem_permissao";
  if (error.code !== FUNCAO_INEXISTENTE) return "falha_alterar";

  // `.select` devolve as linhas alteradas: zero linhas = a policy recusou, e
  // antes isso voltava como sucesso.
  const { data: alteradas, error: erroUpdate } = await supabase
    .from("profiles")
    .update({ disabled: desativada })
    .eq("id", alvo)
    .select("id");
  if (erroUpdate) return "falha_alterar";
  return alteradas?.length ? "ok" : "sem_permissao";
}
