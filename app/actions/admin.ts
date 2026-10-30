"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok?: true; error?: string };

/**
 * Mensagens fixas, com código: voltam para a tela pela URL (`/admin?erro=…`),
 * e mostrar texto livre vindo da URL deixaria qualquer link escrever na tela.
 * Até 14/10/2026 a página descartava o retorno desta action: uma falha no
 * banimento passava em silêncio, e o admin achava que a conta estava barrada.
 */
const MENSAGENS_ADMIN = {
  sem_permissao: "Sem permissão para alterar esta conta.",
  falha_alterar: "Não foi possível alterar a conta.",
  propria_conta: "Você não pode desativar a própria conta admin.",
  sem_chave_desativar: "Conta marcada como desativada, mas o login não foi bloqueado: falta a chave de serviço no servidor.",
  sem_chave_reativar: "Conta reativada no app, mas o desbloqueio do login falhou: falta a chave de serviço no servidor.",
  falha_banir: "Conta marcada como desativada no app, mas o bloqueio de login falhou. Tente de novo.",
  falha_desbanir: "Conta reativada no app, mas o desbloqueio de login falhou. Tente de novo.",
} as const;
export type CodigoErroAdmin = keyof typeof MENSAGENS_ADMIN;

export async function mensagemDeErroAdmin(codigo: string): Promise<string | null> {
  return Object.hasOwn(MENSAGENS_ADMIN, codigo) ? MENSAGENS_ADMIN[codigo as CodigoErroAdmin] : null;
}

export async function codigoDeErroAdmin(mensagem: string): Promise<CodigoErroAdmin | null> {
  const par = Object.entries(MENSAGENS_ADMIN).find(([, m]) => m === mensagem);
  return par ? (par[0] as CodigoErroAdmin) : null;
}

/**
 * ~100 anos: o Supabase Auth não tem "banido para sempre", tem duração.
 * Reativar usa "none".
 */
const BANIMENTO = "876000h";

/**
 * Desativa ou reativa uma conta. Três camadas, porque nenhuma basta sozinha:
 *
 *   1. `profiles.disabled` — lido pelo middleware (telas e rotas do app) e pela
 *      policy restritiva `conta_ativa` (PostgREST e Storage direto, inclusive
 *      com o token que a pessoa JÁ tem).
 *   2. Banimento no Auth — impede login novo e REFRESH do token. Sem isso, a
 *      sessão se renovava indefinidamente.
 *   3. O token em mãos continua válido até expirar (minutos); nesse intervalo
 *      quem barra é a camada 1.
 *
 * O banimento exige service role e roda SÓ aqui no servidor, depois de a
 * policy de admin ter aceitado a alteração do perfil.
 */
export async function toggleUserDisabled(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const targetId = String(formData.get("user_id") ?? "");
  const nextDisabled = formData.get("disabled") === "true";
  if (!targetId) return { error: "Usuário inválido." };
  if (targetId === user.id) return { error: MENSAGENS_ADMIN.propria_conta };

  // RLS: só passa se o usuário logado for admin (policy profiles_update_admin).
  // `.select` devolve as linhas alteradas: zero linhas = a policy recusou, e
  // antes isso voltava como sucesso.
  const { data: alteradas, error } = await supabase
    .from("profiles")
    .update({ disabled: nextDisabled })
    .eq("id", targetId)
    .select("id");

  if (error) return { error: MENSAGENS_ADMIN.falha_alterar };
  if (!alteradas?.length) return { error: MENSAGENS_ADMIN.sem_permissao };

  const admin = createAdminClient();
  if (!admin) {
    revalidatePath("/admin");
    return {
      error: nextDisabled
        ? MENSAGENS_ADMIN.sem_chave_desativar
        : MENSAGENS_ADMIN.sem_chave_reativar,
    };
  }

  const { error: banError } = await admin.auth.admin.updateUserById(targetId, {
    ban_duration: nextDisabled ? BANIMENTO : "none",
  });

  revalidatePath("/admin");
  if (banError) {
    return {
      error: nextDisabled
        ? MENSAGENS_ADMIN.falha_banir
        : MENSAGENS_ADMIN.falha_desbanir,
    };
  }
  return { ok: true };
}
