import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { UnifiedCgmReading } from "@/lib/cgm/types";
import { INGEST_CHUNK, ingestUnifiedReadings } from "./ingest";

// GLYX-19: nenhuma leitura some sem entrar em contagem, e falha não vira "nada existe".

type Linha = Record<string, unknown>;
type Erro = { message: string; code?: string };

type Opcoes = {
  /** Falha a consulta de duplicadas a partir da N-ésima chamada (0-based). */
  falharSelectNa?: number;
  /** Erro não-duplicata para estas external_id, no insert. */
  recusar?: Set<string>;
  /** Ids que existem no banco mas a consulta "não vê" — simula corrida com outro sync. */
  invisiveis?: Set<string>;
};

/** Banco falso de `glucose_readings` com o índice único (user_id, source, external_id). */
function banco(existentes: Linha[] = [], o: Opcoes = {}) {
  const tabela = [...existentes];
  let selects = 0;
  const chave = (l: Linha) => `${l.user_id}|${l.source}|${l.external_id}`;
  const indice = new Set(tabela.filter((l) => l.external_id != null).map(chave));

  const inserir = (linhas: Linha[]): Erro | null => {
    for (const l of linhas) {
      if (o.recusar?.has(l.external_id as string)) return { message: "valor inválido", code: "23514" };
      if (l.external_id != null && indice.has(chave(l))) {
        return { message: "duplicate key", code: "23505" };
      }
    }
    // Tudo ou nada, como o insert em lote do Postgres.
    tabela.push(...linhas);
    for (const l of linhas) if (l.external_id != null) indice.add(chave(l));
    return null;
  };

  const from = () => {
    const filtros: ((l: Linha) => boolean)[] = [];
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), b),
      in: (c: string, vs: unknown[]) => {
        const s = new Set(vs);
        filtros.push((l) => s.has(l[c]));
        return b;
      },
      then: <R>(resolve: (v: { data: Linha[] | null; error: Erro | null }) => R) => {
        const n = selects++;
        if (o.falharSelectNa !== undefined && n >= o.falharSelectNa) {
          return Promise.resolve(resolve({ data: null, error: { message: "414 URI too long" } }));
        }
        const data = tabela
          .filter((l) => filtros.every((f) => f(l)))
          .filter((l) => !o.invisiveis?.has(l.external_id as string));
        return Promise.resolve(resolve({ data, error: null }));
      },
      insert: async (v: Linha | Linha[]) => ({ error: inserir(Array.isArray(v) ? v : [v]) }),
    };
    return b;
  };

  return { cliente: { from } as unknown as SupabaseClient, tabela };
}

function leitura(i: number): UnifiedCgmReading {
  const iso = new Date(Date.UTC(2026, 9, 1) + i * 900_000).toISOString();
  return {
    valueMgDl: 100 + (i % 80),
    recordedAt: iso,
    source: "libre",
    externalId: `libre:${iso}:${100 + (i % 80)}`,
    trend: null,
    metadata: null,
  };
}

const lote = (n: number, de = 0) => Array.from({ length: n }, (_, i) => leitura(de + i));

describe("ingestUnifiedReadings", () => {
  it("CSV de 90 dias entra inteiro, em blocos", async () => {
    const { cliente, tabela } = banco();
    const r = await ingestUnifiedReadings(cliente, "u1", lote(8600));
    expect(r).toEqual({ inserted: 8600, skipped: 0, failed: 0 });
    expect(tabela).toHaveLength(8600);
  });

  it("reimportar o mesmo arquivo não duplica — inclusive acima de mil", async () => {
    const { cliente, tabela } = banco();
    await ingestUnifiedReadings(cliente, "u1", lote(3000));
    const r = await ingestUnifiedReadings(cliente, "u1", lote(3500));
    expect(r).toEqual({ inserted: 500, skipped: 3000, failed: 0 });
    expect(tabela).toHaveLength(3500);
  });

  it("ponto repetido dentro do mesmo envio entra uma vez", async () => {
    const { cliente, tabela } = banco();
    const r = await ingestUnifiedReadings(cliente, "u1", [leitura(1), leitura(1), leitura(2)]);
    expect(r).toEqual({ inserted: 2, skipped: 1, failed: 0 });
    expect(tabela).toHaveLength(2);
  });

  it("falha na consulta de duplicadas para e declara — não vira 'nada existe'", async () => {
    const { cliente, tabela } = banco([], { falharSelectNa: 2 });
    const n = INGEST_CHUNK * 5;
    const r = await ingestUnifiedReadings(cliente, "u1", lote(n));
    expect(r.error).toMatch(/duplicadas/);
    // Os dois primeiros blocos entraram e são contados; o resto é falha, não silêncio.
    expect(r.inserted).toBe(INGEST_CHUNK * 2);
    expect(r.failed).toBe(n - INGEST_CHUNK * 2);
    expect(r.inserted + r.skipped + r.failed).toBe(n);
    expect(tabela).toHaveLength(INGEST_CHUNK * 2);
  });

  it("corrida com outro sync: duplicata que a consulta não viu é pulada, não perdida", async () => {
    const ja = leitura(3);
    const { cliente, tabela } = banco(
      [{ user_id: "u1", source: "libre", external_id: ja.externalId }],
      { invisiveis: new Set([ja.externalId as string]) }
    );
    const r = await ingestUnifiedReadings(cliente, "u1", lote(10));
    expect(r).toEqual({ inserted: 9, skipped: 1, failed: 0 });
    expect(tabela).toHaveLength(10);
  });

  it("no plano B linha a linha, erro que não é duplicata é contado e devolvido", async () => {
    const ja = leitura(3);
    const ruim = leitura(5).externalId as string;
    const { cliente } = banco([{ user_id: "u1", source: "libre", external_id: ja.externalId }], {
      invisiveis: new Set([ja.externalId as string]),
      recusar: new Set([ruim]),
    });
    const r = await ingestUnifiedReadings(cliente, "u1", lote(10));
    // Antes: { inserted: 8, skipped: 1 } e nenhum erro — a leitura 5 sumia.
    expect(r.inserted).toBe(8);
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.error).toMatch(/recusada/);
  });

  it("erro no insert em lote para e conta o bloco como falho", async () => {
    const { cliente } = banco([], { recusar: new Set([leitura(0).externalId as string]) });
    const r = await ingestUnifiedReadings(cliente, "u1", lote(INGEST_CHUNK + 10));
    expect(r.inserted).toBe(0);
    expect(r.failed).toBe(INGEST_CHUNK + 10);
    expect(r.error).toBe("valor inválido");
  });

  it("lista vazia não toca o banco", async () => {
    const { cliente } = banco([], { falharSelectNa: 0 });
    expect(await ingestUnifiedReadings(cliente, "u1", [])).toEqual({
      inserted: 0,
      skipped: 0,
      failed: 0,
    });
  });
});
