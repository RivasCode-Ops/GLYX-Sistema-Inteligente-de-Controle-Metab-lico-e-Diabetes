import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Busca TODAS as linhas, paginando — em vez das primeiras mil.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHA, E POR QUE ELE É INVISÍVEL NA LEITURA DO CÓDIGO
 * ---------------------------------------------------------------------------
 * O PostgREST tem teto implícito de 1000 linhas por resposta. Uma consulta
 * escrita assim:
 *
 *     .select("...").gte("recorded_at", desde).order("recorded_at", { ascending: true })
 *
 * não tem `limit` nenhum e parece trazer tudo. Traz as **mil mais antigas** da
 * janela, silenciosamente — sem erro, sem aviso, sem nada no log.
 *
 * Medido em 08/09/2026: o Histórico de glicemia pedia 120 dias, havia 5.030
 * leituras, e a tela mostrava **12 a 19/07** — sete semanas atrás — dizendo
 * "1000 leituras em 8 dias". A tela estava certa sobre o que recebeu; o que ela
 * recebeu é que era um recorte do começo.
 *
 * Num app de diabetes isso é grave duas vezes: a superfície longitudinal é
 * justamente a que vai ao consultório, e o recorte não se anuncia — parece um
 * histórico completo de um período antigo.
 *
 * A ordenação ascendente é o que escolhe QUAIS mil. Trocar para descendente
 * não resolve: só troca o pedaço perdido de lugar, e ainda mente sobre o total.
 * A saída é paginar, que é o que `lib/reports/full-history.ts` já fazia — e é
 * por isso que o Relatório Completo era a única superfície longitudinal correta
 * do app. Este módulo é aquela função, extraída para ter mais de um consumidor.
 */

/** Tamanho da página. Igual ao teto do PostgREST: menos vira ida e volta à toa. */
export const PAGE_SIZE = 1000;

/**
 * Guarda contra laço infinito. Um milhão de linhas é muito acima de qualquer
 * uso real (o usuário mais antigo tem ~5 mil leituras); se for atingido, algo
 * está errado na consulta e parar é melhor que girar.
 */
const MAX_PAGINAS = 1000;

export type FetchAllOptions = {
  /** Coluna de ordenação, também usada como âncora da paginação. */
  orderColumn: string;
  ascending?: boolean;
  /** Filtro `>=` opcional, aplicado sobre `orderColumn`. */
  since?: string;
  /** Filtro `<` opcional, aplicado sobre `orderColumn`. */
  before?: string;
};

export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  options: FetchAllOptions
): Promise<T[]> {
  const { orderColumn, ascending = true, since, before } = options;
  const rows: T[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const from = pagina * PAGE_SIZE;
    let q = supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .order(orderColumn, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    if (since) q = q.gte(orderColumn, since);
    if (before) q = q.lt(orderColumn, before);

    const { data, error } = await q;
    // Erro interrompe e devolve o que já veio, em vez de estourar a página
    // inteira: histórico parcial com o resto da tela funcionando é melhor que
    // tela de erro. Quem chama decide o que dizer sobre isso.
    if (error) break;

    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}
