import type { SupabaseClient } from "@supabase/supabase-js";
import { PRECOS_POR_MILHAO_USD } from "./cost";

/**
 * Teto global de gasto de IA e chave de desligar (Etapa 1, C7; P52).
 *
 * Antes, `AI_DAILY_BUDGET_USD`/`AI_MONTHLY_BUDGET_USD` só alimentavam o medidor
 * do /admin — nada impedia uma chamada acima do orçamento, e o job de sugestão
 * nem passava por cota. Agora toda chamada de IA consulta o teto antes de falar
 * com o provedor.
 *
 * Os valores padrão são os MESMOS que o medidor do /admin já usava (US$ 1/dia,
 * US$ 20/mês): o teto passa a valer com o número que já estava na tela. Ajuste
 * pelas variáveis de ambiente; a decisão dos valores é do proprietário (P52).
 */

export const TETO_DIA_PADRAO_USD = 1;
export const TETO_MES_PADRAO_USD = 20;

function numeroDoAmbiente(nome: string, padrao: number): number {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v > 0 ? v : padrao;
}

export function tetosDeIa(): { dia: number; mes: number } {
  return {
    dia: numeroDoAmbiente("AI_DAILY_BUDGET_USD", TETO_DIA_PADRAO_USD),
    mes: numeroDoAmbiente("AI_MONTHLY_BUDGET_USD", TETO_MES_PADRAO_USD),
  };
}

/** Chave de desligar: `AI_DISABLED=1` (ou true/sim) recusa toda chamada de IA. */
export function iaDesligada(): boolean {
  const v = process.env.AI_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "sim";
}

export type VereditoDoTeto =
  | { permitido: true }
  | { permitido: false; motivo: "ia_desligada" | "teto_global" | "falha_na_checagem" };

/** A função ainda não existe no banco (migration 20261031103000 não aplicada). */
function funcaoAusente(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Consulta o teto antes de chamar o modelo.
 *
 * - Desligada pela chave: recusa sem tocar o banco.
 * - Sem a migration ainda aplicada: deixa passar (comportamento anterior), para o
 *   código poder ir antes da migration sem derrubar a IA.
 * - Qualquer outro erro: recusa (falha fechada, como a cota por usuário).
 */
export async function verificarTetoGlobal(supabase: SupabaseClient): Promise<VereditoDoTeto> {
  if (iaDesligada()) return { permitido: false, motivo: "ia_desligada" };

  const { dia, mes } = tetosDeIa();
  const { data, error } = await supabase.rpc("ia_dentro_do_teto", {
    p_precos: PRECOS_POR_MILHAO_USD,
    p_teto_dia: dia,
    p_teto_mes: mes,
  });

  if (funcaoAusente(error)) return { permitido: true };
  if (error) return { permitido: false, motivo: "falha_na_checagem" };
  return data === true ? { permitido: true } : { permitido: false, motivo: "teto_global" };
}

export function mensagemDoTeto(motivo: Exclude<VereditoDoTeto, { permitido: true }>["motivo"]): string {
  switch (motivo) {
    case "ia_desligada":
      return "A IA está temporariamente desligada no GLYX.";
    case "teto_global":
      return "O limite de uso de IA do GLYX foi atingido por hoje. Tente de novo amanhã.";
    case "falha_na_checagem":
      return "Não foi possível conferir o limite de uso de IA agora. Tente de novo em instantes.";
  }
}
