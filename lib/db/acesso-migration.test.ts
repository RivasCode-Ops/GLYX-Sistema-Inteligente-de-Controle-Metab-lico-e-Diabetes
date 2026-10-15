import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Trava estática de 20261015102000 (GLYX-23 e GLYX-24). Não prova que as
 * policies funcionam — isso exige banco de teste (supabase/tests/). Prova que
 * a migration cobre o schema inteiro e que as decisões não são desfeitas por
 * edição descuidada.
 */

const DIR = join(process.cwd(), "supabase", "migrations");
const ARQUIVO = "20261015102000_conta_ativa_e_uso_de_ia.sql";
const semComentarios = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const TODAS = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(DIR, f), "utf8"))
  .join("\n");
const SQL = semComentarios(readFileSync(join(DIR, ARQUIVO), "utf8"));

function tabelasComUserId(): string[] {
  const out: string[] = [];
  for (const m of TODAS.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    if (/^\s*user_id\s/m.test(m[2])) out.push(m[1]);
  }
  return out.sort();
}

function listaDaPolicyRestritiva(): string[] {
  const bloco = SQL.match(/foreach t in array array\[([\s\S]*?)\]/);
  return [...(bloco?.[1] ?? "").matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
}

describe("conta desativada barrada no banco", () => {
  it("a policy restritiva cobre toda tabela com user_id do schema", () => {
    expect(listaDaPolicyRestritiva()).toEqual(tabelasComUserId());
  });

  it("é RESTRITIVA, para valer junto das policies de dono", () => {
    expect(SQL).toMatch(/create policy conta_ativa on public\.%I as restrictive for all to authenticated/);
    expect(SQL).toMatch(/using \(\(select public\.conta_ativa\(\)\)\) with check \(\(select public\.conta_ativa\(\)\)\)/);
  });

  it("profiles fica fora: o middleware precisa ler o próprio disabled", () => {
    expect(listaDaPolicyRestritiva()).not.toContain("profiles");
  });

  it("Storage dos três buckets também barra conta desativada", () => {
    expect(SQL).toMatch(/on storage\.objects\s+as restrictive/);
    for (const b of ["meal-photos", "medication-labels", "body-photos"]) expect(SQL).toContain(`'${b}'`);
  });

  it("conta_ativa é executável por authenticated e não por anon", () => {
    expect(SQL).toMatch(/revoke all on function public\.conta_ativa\(\) from public, anon;/);
    expect(SQL).toMatch(/grant execute on function public\.conta_ativa\(\) to authenticated;/);
  });
});

describe("ai_usage protegida", () => {
  it("a policy for all sai e o usuário só lê", () => {
    expect(SQL).toMatch(/drop policy if exists "ai_usage_own" on public\.ai_usage;/);
    expect(SQL).toMatch(/create policy "ai_usage_select_own"\s+on public\.ai_usage for select/);
    expect(SQL).not.toMatch(/on public\.ai_usage for (all|insert|update|delete)/);
  });

  it("a cota é atômica: trava por usuário e tipo antes de contar", () => {
    const corpo = SQL.slice(SQL.indexOf("function public.consumir_cota_ia"));
    expect(corpo.indexOf("pg_advisory_xact_lock")).toBeGreaterThan(-1);
    expect(corpo.indexOf("pg_advisory_xact_lock")).toBeLessThan(corpo.indexOf("select count(*)"));
  });

  it("D4: não há função de exclusão de uso chamável pelo usuário (zeraria a cota à parte)", () => {
    expect(SQL).toMatch(/drop function if exists public\.apagar_meu_uso_de_ia\(\);/);
    expect(SQL).not.toMatch(/create or replace function public\.apagar_meu_uso_de_ia/);
    expect(SQL).not.toMatch(/interval '24 hours'/);
  });

  it("RPCs novas fora do alcance de anon", () => {
    for (const fn of ["consumir_cota_ia", "registrar_tokens_ia"]) {
      expect(SQL).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`));
    }
  });

  it("o cron registra custo com service role", () => {
    expect(SQL).toMatch(/grant execute on function public\.record_system_ai_usage\([^)]*\) to service_role;/);
  });
});
