"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { publicDbError } from "@/lib/errors/public-error";

export type ConsentimentoResult = { ok?: true; ativo?: boolean; error?: string };

/**
 * Liga ou desliga a sugestão automática de refeição por IA (Etapa 1, A1; P06).
 *
 * É a única forma de o job `glyx-meal-suggest` mandar dado clínico (tipo de
 * diabetes, última glicemia, totais do dia) ao provedor de IA. Padrão:
 * desligado. A pessoa liga sabendo o que vai — o texto da tela diz.
 */
export async function definirSugestaoAutomaticaIA(formData: FormData): Promise<ConsentimentoResult> {
  const ativo = formData.get("ativo") === "true";

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("profiles")
    .update({ ia_sugestao_automatica: ativo, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: publicDbError(error, "actions/ai-consent") };

  revalidatePath("/perfil/conta");
  return { ok: true, ativo };
}
