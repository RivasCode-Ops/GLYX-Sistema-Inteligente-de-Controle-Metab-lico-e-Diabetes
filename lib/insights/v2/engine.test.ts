import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { GLUCOSE_INSIGHT_MODULE, persistFindings, type CorrelationFinding } from "./engine";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * SQL de todas as migrations, em ordem de aplicação e **sem comentários**.
 *
 * Descartar `--` não é cosmético: os blocos de rollback deste diretório são SQL
 * comentado e contêm justamente as versões antigas de CHECK e default. Sem a
 * limpeza, uma asserção sobre "o último estado" leria o rollback como se fosse
 * a definição vigente e passaria a validar o contrário do que o banco tem.
 */
function allMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

type Upsert = { rows: Record<string, unknown>[]; options: { onConflict?: string } };

/** Client mínimo que só grava o que `persistFindings` tentou enviar. */
function fakeClient(captured: Upsert[]) {
  return {
    from: () => ({
      upsert: (rows: Record<string, unknown>[], options: { onConflict?: string }) => {
        captured.push({ rows, options });
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
}

const FINDING: CorrelationFinding = {
  slug: "sleep_vs_glucose_avg",
  title: "Sono e média glicémica",
  body: "corpo",
  severity: "info",
  metrics: {},
};

describe("persistFindings", () => {
  it("carimba o módulo em cada linha", async () => {
    const captured: Upsert[] = [];
    await persistFindings(fakeClient(captured), "user-1", [FINDING], GLUCOSE_INSIGHT_MODULE);

    expect(captured).toHaveLength(1);
    expect(captured[0].rows[0].module).toBe("glucose");
  });

  it("resolve conflito por (user_id, module, slug), não por (user_id, slug)", async () => {
    const captured: Upsert[] = [];
    await persistFindings(fakeClient(captured), "user-1", [FINDING], GLUCOSE_INSIGHT_MODULE);

    // Com o onConflict antigo, o mesmo slug vindo de outro módulo sobrescreveria
    // este achado em silêncio — e hoje o Postgres nem aceitaria a inferência,
    // porque a unique (user_id, slug) deixou de existir.
    expect(captured[0].options.onConflict).toBe("user_id,module,slug");
  });

  it("não chama o banco quando não há achados", async () => {
    const captured: Upsert[] = [];
    const r = await persistFindings(fakeClient(captured), "user-1", [], GLUCOSE_INSIGHT_MODULE);

    expect(captured).toHaveLength(0);
    expect(r.upserted).toBe(0);
  });

  it("grava um módulo diferente sem cair em glicemia", async () => {
    const captured: Upsert[] = [];
    await persistFindings(fakeClient(captured), "user-1", [FINDING], "training");

    expect(captured[0].rows[0].module).toBe("training");
  });
});

describe("schema de insight_findings", () => {
  it("mantém a unicidade por módulo — o onConflict do código depende dela", () => {
    expect(allMigrationsSql()).toContain("unique (user_id, module, slug)");
  });

  /**
   * O CHECK de `module` já foi redefinido uma vez, então procurar a string no
   * histórico concatenado não prova nada: a definição antiga continua lá. O que
   * vale é a **última** ocorrência, que é o estado em que o banco fica depois de
   * aplicar as migrations em ordem.
   */
  function currentModuleCheckValues(): string[] {
    const all = [...allMigrationsSql().matchAll(/check \(module in \(([^)]+)\)\)/g)];
    expect(all.length).toBeGreaterThan(0);
    return all[all.length - 1][1].split(",").map((v) => v.trim().replace(/'/g, ""));
  }

  it("restringe module por CHECK, para módulo inválido falhar alto", () => {
    expect(currentModuleCheckValues()).toEqual(["glucose", "training"]);
  });

  /**
   * A união do TypeScript e o CHECK do Postgres são a mesma regra escrita duas
   * vezes. Se divergirem, o código aceita um módulo que a gravação rejeita — e
   * o erro só aparece em produção, no upsert.
   */
  it("mantém InsightModule em sincronia com o CHECK do banco", () => {
    const ts = readFileSync(join(process.cwd(), "types", "database.ts"), "utf8");
    const union = ts.match(/export type InsightModule = ([^;]+);/);
    expect(union).not.toBeNull();

    const declarados = union![1].split("|").map((v) => v.trim().replace(/"/g, ""));
    expect(declarados.sort()).toEqual(currentModuleCheckValues().sort());
  });

  /**
   * Sem default, um insert que esqueça `module` estoura NOT NULL. Com default,
   * ele seria carimbado como glicemia em silêncio — que é justamente o modo de
   * falha que esta coluna existe para impedir.
   */
  it("não reintroduz default em module", () => {
    const sql = allMigrationsSql();
    const ultimoDrop = sql.lastIndexOf("alter column module drop default");
    const ultimoSet = sql.lastIndexOf("alter column module set default");
    expect(ultimoDrop).toBeGreaterThan(-1);
    expect(ultimoSet).toBeLessThan(ultimoDrop);
  });
});
