import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRowsDetalhado } from "@/lib/queries/fetch-all";
import {
  EXPORT_ORDER_COLUMN,
  EXPORT_REDACT_COLUMNS,
  USER_DATA_EXPORT_TABLES,
} from "@/lib/privacy/user-data";

function redigir(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const cols = EXPORT_REDACT_COLUMNS[table];
  if (!cols?.length) return row;
  const copy = { ...row };
  for (const col of cols) {
    if (col in copy) copy[col] = "[redacted]";
  }
  return copy;
}

export type ExportacaoIncompleta = { tabela: string; linhasExportadas: number; motivo: string };

/**
 * Monta o JSON de portabilidade, tabela a tabela, paginado.
 *
 * Tabela que não pôde ser lida inteira NÃO sai como se estivesse completa: o
 * topo do arquivo lista `incompletas`, com quantas linhas vieram e por quê.
 * A mensagem de erro do banco não vai para o arquivo — só o fato de ter
 * falhado.
 */
export async function montarExportacao(
  supabase: SupabaseClient,
  userId: string,
  email: string | null
): Promise<Record<string, unknown>> {
  const incompletas: ExportacaoIncompleta[] = [];
  const tabelas: Record<string, unknown> = {};

  for (const table of USER_DATA_EXPORT_TABLES) {
    if (table === "profiles") {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) incompletas.push({ tabela: table, linhasExportadas: 0, motivo: "falha ao ler" });
      tabelas[table] = data ? [data] : [];
      continue;
    }

    const r = await fetchAllRowsDetalhado<Record<string, unknown>>(supabase, table, "*", userId, {
      orderColumn: EXPORT_ORDER_COLUMN[table] ?? "id",
    });
    tabelas[table] = r.rows.map((row) => redigir(table, row));
    if (!r.completo) {
      incompletas.push({ tabela: table, linhasExportadas: r.rows.length, motivo: "falha ao ler; arquivo parcial" });
    }
  }

  return {
    exported_at: new Date().toISOString(),
    user: { id: userId, email },
    completo: incompletas.length === 0,
    incompletas,
    ...tabelas,
  };
}
