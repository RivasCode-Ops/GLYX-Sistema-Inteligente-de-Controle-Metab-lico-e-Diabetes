import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPORT_ORDER_COLUMN,
  PROFILE_KEPT_COLUMNS,
  PROFILE_RESET_NULL_COLUMNS,
  USER_DATA_CASCADE,
  USER_DATA_DELETE_ORDER,
  USER_DATA_EXPORT_TABLES,
} from "./user-data";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function loadAllMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

const SQL = loadAllMigrationsSql();

/**
 * Tabelas e colunas EXTRAÍDAS do SQL — não escritas à mão.
 *
 * Até 14/10/2026 este teste comparava o inventário com uma lista fixa de 27
 * tabelas, que ninguém atualizou quando setembro criou hypo_plan, hypo_events,
 * health_events e user_substance_windows. As quatro ficaram fora da exclusão
 * LGPD e o teste continuou verde. Agora, tabela nova com `user_id` reprova
 * aqui até entrar no inventário ou na lista de exceções com motivo.
 */
function blocosDeTabela(sql: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/gi;
  for (const m of sql.matchAll(re)) out.set(m[1], m[2]);
  return out;
}

function colunasAdicionadas(sql: string, tabela: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`alter table public\\.${tabela}\\b([\\s\\S]*?);`, "gi");
  for (const m of sql.matchAll(re)) {
    for (const c of m[1].matchAll(/add column if not exists (\w+)/gi)) out.push(c[1]);
  }
  return out;
}

function temColuna(bloco: string, extras: string[], coluna: string): boolean {
  return new RegExp(`^\\s*${coluna}\\s`, "m").test(bloco) || extras.includes(coluna);
}

const TABELAS = blocosDeTabela(SQL);
const COM_USER_ID = [...TABELAS.entries()]
  .filter(([nome, bloco]) => temColuna(bloco, colunasAdicionadas(SQL, nome), "user_id"))
  .map(([nome]) => nome)
  .sort();

/** Exceções do DELETE comum, com motivo. */
const FORA_DO_DELETE: Record<string, string> = {
  ai_usage: "apagada inteira pelo servidor (chave de serviço) só dentro da exclusão completa (GLYX-24, decisão D4)",
};

describe("extração do schema", () => {
  it("encontra as tabelas — se o formato das migrations mudar, este teste não pode passar vazio", () => {
    expect(TABELAS.size).toBeGreaterThanOrEqual(37);
    expect(COM_USER_ID).toEqual(expect.arrayContaining(["glucose_readings", "hypo_plan", "health_events"]));
  });
});

describe("cobertura RLS nas migrations", () => {
  it.each(COM_USER_ID)("%s tem RLS habilitado e policy com auth.uid()", (table) => {
    expect(SQL).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security`, "i"));
    expect(SQL).toMatch(new RegExp(`on public\\.${table}[\\s\\S]{0,500}auth\\.uid\\(\\)`, "i"));
  });

  it("profiles usa RLS por id = auth.uid()", () => {
    expect(SQL).toMatch(/alter table public\.profiles\s+enable row level security/i);
    expect(SQL).toMatch(/on public\.profiles[\s\S]{0,300}auth\.uid\(\)\s*=\s*id/i);
  });
});

describe("inventário LGPD derivado do schema", () => {
  it.each(COM_USER_ID)("%s é apagada na exclusão", (table) => {
    const coberta =
      (USER_DATA_DELETE_ORDER as readonly string[]).includes(table) ||
      table in USER_DATA_CASCADE ||
      table in FORA_DO_DELETE;
    expect(coberta, `${table} tem user_id e não está no inventário de exclusão`).toBe(true);
  });

  it.each(COM_USER_ID)("%s sai na exportação", (table) => {
    expect(USER_DATA_EXPORT_TABLES as readonly string[]).toContain(table);
  });

  it("cascata declarada aponta para pai que está no DELETE", () => {
    for (const pai of Object.values(USER_DATA_CASCADE)) {
      expect(USER_DATA_DELETE_ORDER as readonly string[]).toContain(pai);
    }
  });

  it.each(USER_DATA_EXPORT_TABLES.filter((t) => t !== "profiles"))(
    "%s tem a coluna de ordenação da exportação paginada",
    (table) => {
      const bloco = TABELAS.get(table);
      expect(bloco, `${table} não encontrada nas migrations`).toBeDefined();
      const coluna = EXPORT_ORDER_COLUMN[table] ?? "id";
      expect(temColuna(bloco!, colunasAdicionadas(SQL, table), coluna)).toBe(true);
    }
  );

  it("toda coluna do perfil é limpa na exclusão ou mantida com motivo", () => {
    const colunas = [
      ...(TABELAS.get("profiles") ?? "").matchAll(/^\s*(\w+)\s+\w/gm),
    ]
      .map((m) => m[1])
      .filter((c) => c !== "primary")
      .concat(colunasAdicionadas(SQL, "profiles"));
    const conhecidas = new Set<string>([...PROFILE_RESET_NULL_COLUMNS, ...Object.keys(PROFILE_KEPT_COLUMNS)]);
    const soltas = [...new Set(colunas)].filter((c) => !conhecidas.has(c));
    expect(soltas, "coluna nova em profiles: decidir se a exclusão a limpa").toEqual([]);
  });
});
