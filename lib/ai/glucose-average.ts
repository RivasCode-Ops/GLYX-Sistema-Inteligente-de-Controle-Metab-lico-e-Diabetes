import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRowsDetalhado } from "@/lib/queries/fetch-all";

/**
 * Média de glicemia dos últimos N dias para o contexto das rotas de IA.
 *
 * As rotas `supplement-check`, `goal-feasibility` e `body-composition` faziam
 * `select("value_mg_dl").gte(...)` sem paginar: com o Libre (~190 leituras/dia)
 * 14 dias passam de 2.600 linhas, e o PostgREST devolve só mil, sem aviso. A
 * média saía de um pedaço da janela e ia ao modelo como se fosse dela inteira
 * (GLYX-27; o mesmo defeito que `fetch-all.ts` fechou nas telas).
 *
 * Leitura parcial devolve `media: null` e `completo: false`. Média de pedaço
 * não é aproximação da média — é a média de outro período.
 */
export type GlucoseAverage = { media: number | null; leituras: number; completo: boolean };

export async function glucoseAverage(
  supabase: SupabaseClient,
  userId: string,
  dias = 14,
  now: Date = new Date()
): Promise<GlucoseAverage> {
  const since = new Date(now.getTime() - dias * 86_400_000).toISOString();
  const { rows, completo } = await fetchAllRowsDetalhado<{ value_mg_dl: number }>(
    supabase,
    "glucose_readings",
    "value_mg_dl",
    userId,
    { orderColumn: "recorded_at", since }
  );
  if (!completo) return { media: null, leituras: rows.length, completo: false };
  if (!rows.length) return { media: null, leituras: 0, completo: true };
  const soma = rows.reduce((s, r) => s + r.value_mg_dl, 0);
  return { media: Math.round(soma / rows.length), leituras: rows.length, completo: true };
}

/** Frase para o prompt. As três rotas dizem a mesma coisa sobre o mesmo dado. */
export function describeGlucoseAverage(g: GlucoseAverage, dias = 14): string {
  if (!g.completo) {
    return `Glicemia média (${dias} dias): não calculada — a leitura do histórico falhou no meio. Não estime.`;
  }
  if (g.media == null) return "Sem leituras recentes de glicemia.";
  return `Glicemia média (${dias} dias): ${g.media} mg/dL.`;
}
