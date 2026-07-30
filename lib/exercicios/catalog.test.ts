import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O catálogo de exercícios vive no banco, semeado por migration — não há
 * constante TypeScript equivalente para testar. Estes testes leem o SQL porque a
 * suíte não sobe Postgres (sem `config.toml`, sem container). É paliativo
 * assumido: o certo seria introspectar `pg_constraint` e consultar as linhas.
 *
 * Ainda assim vale, porque o que eles pegam é exatamente o que uma lista de 42
 * registros escrita à mão erra: slug repetido, músculo fora do vocabulário,
 * cardio com músculo, e a união do TypeScript saindo de sincronia com o CHECK.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260730140000_exercise_catalog.sql"
);

/** SQL sem comentários — blocos de rollback e notas são SQL comentado. */
function sql(): string {
  return readFileSync(MIGRATION, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

/** Vocabulário aceito pelo CHECK de `primary_muscle`. */
function checkVocabulary(): string[] {
  const m = sql().match(/primary_muscle text check \(primary_muscle in \(([\s\S]*?)\)\)/);
  expect(m).not.toBeNull();
  return m![1]
    .split(",")
    .map((v) => v.trim().replace(/'/g, ""))
    .filter(Boolean);
}

type SeedRow = { slug: string; name: string; mechanic: string; muscle: string | null };

function seedRows(): SeedRow[] {
  const body = sql().split("values")[1] ?? "";
  const rows: SeedRow[] = [];
  // ('slug', 'nome', 'mecanica', 'musculo'|null, 'categoria')
  const re =
    /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(null|'[^']+')\s*,\s*'([^']+)'\s*\)/g;
  for (const m of body.matchAll(re)) {
    rows.push({
      slug: m[1],
      name: m[2],
      mechanic: m[3],
      muscle: m[4] === "null" ? null : m[4].replace(/'/g, ""),
    });
  }
  return rows;
}

describe("catálogo de exercícios", () => {
  it("semeia 40 de resistência e 2 de cardio", () => {
    const rows = seedRows();
    expect(rows).toHaveLength(42);
    expect(rows.filter((r) => r.mechanic === "resistencia")).toHaveLength(40);
    expect(rows.filter((r) => r.mechanic === "cardio")).toHaveLength(2);
  });

  it("não repete slug", () => {
    const slugs = seedRows().map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("usa slug em kebab-case ascii — é chave estável, não rótulo", () => {
    for (const { slug } of seedRows()) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("todo músculo semeado existe no vocabulário do CHECK", () => {
    const vocab = new Set(checkVocabulary());
    for (const row of seedRows()) {
      if (row.muscle === null) continue;
      expect(vocab.has(row.muscle), `${row.slug} -> ${row.muscle}`).toBe(true);
    }
  });

  /**
   * O CHECK `exercises_muscle_matches_mechanic` já garante isto no banco. O teste
   * existe para o caso inverso: um seed que viole a regra faz a migration inteira
   * falhar na aplicação, e é mais barato descobrir aqui do que no deploy.
   */
  it("resistência sempre tem primário e cardio nunca tem", () => {
    for (const row of seedRows()) {
      if (row.mechanic === "cardio") expect(row.muscle).toBeNull();
      else expect(row.muscle).not.toBeNull();
    }
  });

  it("exercita os 12 valores do vocabulário — nenhum nasce órfão", () => {
    const usados = new Set(seedRows().map((r) => r.muscle).filter(Boolean));
    expect([...usados].sort()).toEqual(checkVocabulary().sort());
  });

  /**
   * CatalogMuscleId e o CHECK são a mesma regra em duas linguagens. Divergindo,
   * o código aceita um músculo que a gravação rejeita — erro que só apareceria
   * quando a Fatia 2 começasse a escrever.
   */
  it("mantém CatalogMuscleId em sincronia com o CHECK", () => {
    const ts = readFileSync(join(process.cwd(), "types", "database.ts"), "utf8");
    const union = ts.match(/export type CatalogMuscleId =([\s\S]*?);/);
    expect(union).not.toBeNull();

    const declarados = [...union![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(declarados.sort()).toEqual(checkVocabulary().sort());
  });

  /**
   * Variações do mesmo padrão são registros separados de propósito (o vetor de
   * ativação da Fatia 2 difere entre barra e halteres). Se alguém "limpar" isso
   * fundindo os pares, a Fatia 2 perde a distinção que ela existe para medir.
   */
  it("mantém as variações barra/halteres separadas", () => {
    const slugs = new Set(seedRows().map((r) => r.slug));
    for (const par of [
      ["supino-reto-barra", "supino-reto-halteres"],
      ["supino-inclinado-barra", "supino-inclinado-halteres"],
    ]) {
      for (const slug of par) expect(slugs.has(slug)).toBe(true);
    }
  });
});
