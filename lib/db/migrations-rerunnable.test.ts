import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * As migrations têm que poder rodar de novo.
 *
 * Não é preciosismo: elas são aplicadas À MÃO, pelo painel do Supabase, numa
 * sequência de sete. Falhar no meio e tentar de novo é o caso comum. E o
 * Postgres não aceita `if not exists` em `create policy` nem em `add
 * constraint` — sem um `drop … if exists` antes, a segunda execução falha
 * DEPOIS de já ter criado tabela e índice (que são idempotentes), deixando o
 * banco no meio do caminho.
 *
 * Isto é teste e não comentário porque comentário não impede o retorno do
 * atalho — a próxima migration escrita com pressa passaria por revisão.
 */

const DIR = join(process.cwd(), "supabase", "migrations");

/**
 * Corte: migrations anteriores a esta já foram aplicadas no banco.
 *
 * Vinte e três delas reprovam nestas regras, e ficam de fora de propósito —
 * **reescrever migration aplicada é pior que o defeito que ela tem**. O
 * Supabase guarda o hash do que rodou, e um arquivo editado depois faz o
 * histórico deixar de bater com o banco.
 *
 * O risco delas também é menor do que parece, e vale dizer por quê em vez de
 * deixar no ar: num banco VAZIO todas rodam, porque nada existe para colidir. O
 * defeito só morde em reexecução — e elas não vão ser reexecutadas. É
 * exatamente a situação inversa das sete de 07/09/2026, que ainda vão ser
 * aplicadas à mão, uma a uma, com retry provável.
 *
 * A regra vale para toda migration nova daqui em diante.
 */
const APLICADAS_ATE = "20260907000000";

function migrations(): { nome: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => f.slice(0, 14) > APLICADAS_ATE)
    .map((nome) => ({ nome, sql: readFileSync(join(DIR, nome), "utf8") }));
}

/** Remove comentários de linha para não contar exemplo citado em prosa. */
function semComentarios(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

describe("migrations reexecutáveis", () => {
  const arquivos = migrations();

  it("existe pelo menos uma migration nova para conferir", () => {
    // Se o corte engolir tudo, os `it.each` abaixo rodam sobre lista vazia e
    // passam sem verificar nada — falso verde silencioso.
    expect(arquivos.length).toBeGreaterThan(0);
  });

  it.each(arquivos.map((m) => m.nome))("%s: toda policy tem drop antes", (nome) => {
    const sql = semComentarios(arquivos.find((m) => m.nome === nome)!.sql);
    const criadas = [...sql.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+([\w.]+)/gi)];
    for (const [, policy, tabela] of criadas) {
      const drop = new RegExp(
        `drop\\s+policy\\s+if\\s+exists\\s+"${policy}"\\s+on\\s+${tabela.replace(".", "\\.")}`,
        "i"
      );
      expect(
        drop.test(sql),
        `policy "${policy}" em ${tabela} é criada sem "drop policy if exists" antes: rodar a migration duas vezes falha`
      ).toBe(true);
    }
  });

  it.each(arquivos.map((m) => m.nome))("%s: toda constraint tem drop antes", (nome) => {
    const sql = semComentarios(arquivos.find((m) => m.nome === nome)!.sql);
    const criadas = [...sql.matchAll(/add\s+constraint\s+([\w]+)/gi)];
    for (const [, constraint] of criadas) {
      const drop = new RegExp(`drop\\s+constraint\\s+if\\s+exists\\s+${constraint}\\b`, "i");
      expect(
        drop.test(sql),
        `constraint ${constraint} é adicionada sem "drop constraint if exists" antes: rodar a migration duas vezes falha`
      ).toBe(true);
    }
  });

  it.each(arquivos.map((m) => m.nome))("%s: toda coluna nova usa if not exists", (nome) => {
    const sql = semComentarios(arquivos.find((m) => m.nome === nome)!.sql);
    const adds = [...sql.matchAll(/add\s+column\s+(if\s+not\s+exists\s+)?([\w]+)/gi)];
    for (const [, guarda, coluna] of adds) {
      expect(
        Boolean(guarda),
        `coluna ${coluna} é adicionada sem "if not exists" em ${nome}`
      ).toBe(true);
    }
  });

  it.each(arquivos.map((m) => m.nome))("%s: todo seed tem on conflict", (nome) => {
    const sql = semComentarios(arquivos.find((m) => m.nome === nome)!.sql);
    const inserts = (sql.match(/insert\s+into/gi) ?? []).length;
    const conflitos = (sql.match(/on\s+conflict/gi) ?? []).length;
    expect(
      conflitos,
      `${nome} tem ${inserts} insert(s) e ${conflitos} "on conflict": seed sem guarda duplica na segunda execução`
    ).toBeGreaterThanOrEqual(inserts);
  });
});
