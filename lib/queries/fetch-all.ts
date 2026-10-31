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
  /**
   * Traz também as linhas de demonstração (`source = 'mock'`). Padrão: não —
   * nenhuma análise mistura semente de demo com medição real (Etapa 2, B12).
   * Só quem CONTA o demo à parte (o relatório completo, que o declara no
   * cabeçalho) liga isto.
   */
  incluirDemonstracao?: boolean;
};

/** Tabelas com coluna `source` que pode conter dado de demonstração. */
const TABELAS_COM_DEMONSTRACAO = new Set(["glucose_readings", "health_snapshots"]);

/**
 * Filtro "sem demonstração" para consultas diretas a essas tabelas. `or` com
 * `is.null` porque `source <> 'mock'` é NULL (e some) em linha sem fonte.
 */
export const FILTRO_SEM_DEMONSTRACAO = "source.is.null,source.neq.mock";

/**
 * Resultado com a completude explícita.
 *
 * `fetchAllRows` interrompe em erro e devolve o que já veio — e o comentário
 * dizia "quem chama decide o que dizer sobre isso", mas quem chama não tinha
 * como saber. Histórico parcial ficava indistinguível de completo. Aqui o
 * chamador recebe `completo: false` e o motivo, e decide o que mostrar.
 */
export type FetchAllResult<T> = { rows: T[]; completo: boolean; erro: string | null };

export async function fetchAllRowsDetalhado<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  options: FetchAllOptions
): Promise<FetchAllResult<T>> {
  const { orderColumn, ascending = true, since, before, incluirDemonstracao = false } = options;
  const semDemo = !incluirDemonstracao && TABELAS_COM_DEMONSTRACAO.has(table);
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
    if (semDemo) q = q.or(FILTRO_SEM_DEMONSTRACAO);

    const { data, error } = await q;
    if (error) return { rows, completo: false, erro: error.message };

    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, completo: true, erro: null };
  }

  return { rows, completo: false, erro: `limite de ${MAX_PAGINAS} páginas atingido` };
}

/**
 * Versão que devolve só as linhas, mantida para os chamadores anteriores.
 * Código novo deve usar `fetchAllRowsDetalhado` e tratar `completo`.
 */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  options: FetchAllOptions
): Promise<T[]> {
  return (await fetchAllRowsDetalhado<T>(supabase, table, columns, userId, options)).rows;
}
