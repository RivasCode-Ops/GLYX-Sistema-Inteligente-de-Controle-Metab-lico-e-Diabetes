import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase falso que imita o PostgREST num ponto que importa: o TETO
 * de 1000 linhas por requisição. Consulta sem `.range()` recebe só as mil
 * primeiras, em silêncio — exatamente como o servidor real faz. Só para teste;
 * nenhuma rede.
 *
 * `falharNaPagina`: a partir dessa página (0-based), devolve erro.
 */
export const TETO_POSTGREST = 1000;

type Linha = Record<string, unknown>;

export function clientePaginadoFalso(
  tabelas: Record<string, Linha[]>,
  opcoes: { falharNaPagina?: number } = {}
) {
  const chamadas: { tabela: string; de: number; ate: number }[] = [];

  const from = (tabela: string) => {
    let linhas = [...(tabelas[tabela] ?? [])];
    let faixa: [number, number] | null = null;
    let limite: number | null = null;

    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => {
        linhas = linhas.filter((l) => l[c] === v);
        return b;
      },
      gte: (c: string, v: unknown) => {
        linhas = linhas.filter((l) => String(l[c]) >= String(v));
        return b;
      },
      lt: (c: string, v: unknown) => {
        linhas = linhas.filter((l) => String(l[c]) < String(v));
        return b;
      },
      lte: (c: string, v: unknown) => {
        linhas = linhas.filter((l) => String(l[c]) <= String(v));
        return b;
      },
      not: () => b,
      in: () => b,
      // Só o que os chamadores usam: lista de `coluna.is.null` / `coluna.neq.valor`.
      or: (expr: string) => {
        const termos = expr.split(",").map((t) => t.split("."));
        linhas = linhas.filter((l) =>
          termos.some(([c, op, v]) =>
            op === "is" && v === "null" ? l[c] == null : op === "neq" ? l[c] != null && String(l[c]) !== v : false
          )
        );
        return b;
      },
      order: (c: string, o?: { ascending?: boolean }) => {
        const asc = o?.ascending ?? true;
        linhas.sort((x, y) => (String(x[c]) < String(y[c]) ? -1 : String(x[c]) > String(y[c]) ? 1 : 0) * (asc ? 1 : -1));
        return b;
      },
      limit: (n: number) => {
        limite = n;
        return b;
      },
      range: (de: number, ate: number) => {
        faixa = [de, ate];
        return b;
      },
      maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
      then: <R>(resolve: (v: { data: Linha[] | null; error: { message: string } | null }) => R) => {
        const [de, ate] = faixa ?? [0, TETO_POSTGREST - 1];
        chamadas.push({ tabela, de, ate });
        const pagina = Math.floor(de / TETO_POSTGREST);
        if (opcoes.falharNaPagina !== undefined && pagina >= opcoes.falharNaPagina) {
          return Promise.resolve(resolve({ data: null, error: { message: "falha simulada" } }));
        }
        const tamanho = Math.min(ate - de + 1, TETO_POSTGREST, limite ?? Infinity);
        return Promise.resolve(resolve({ data: linhas.slice(de, de + tamanho), error: null }));
      },
    };
    return b;
  };

  return { cliente: { from } as unknown as SupabaseClient, chamadas };
}

/** n leituras de glicemia de um usuário, uma por minuto a partir de `inicio`. */
export function leituras(n: number, userId = "u1", inicio = Date.UTC(2026, 9, 1)): Linha[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${String(i).padStart(6, "0")}`,
    user_id: userId,
    value_mg_dl: 100 + (i % 50),
    recorded_at: new Date(inicio + i * 60_000).toISOString(),
  }));
}
