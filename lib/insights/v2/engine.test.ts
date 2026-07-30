import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { GLUCOSE_INSIGHT_MODULE, persistFindings, type CorrelationFinding } from "./engine";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function allMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
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

  it("grava um módulo diferente sem tocar no default do banco", async () => {
    const captured: Upsert[] = [];
    await persistFindings(fakeClient(captured), "user-1", [FINDING], "body");

    expect(captured[0].rows[0].module).toBe("body");
  });
});

describe("schema de insight_findings", () => {
  it("mantém a unicidade por módulo — o onConflict do código depende dela", () => {
    const sql = allMigrationsSql();
    expect(sql).toContain("unique (user_id, module, slug)");
  });

  it("restringe module por CHECK, para slug no módulo errado falhar alto", () => {
    const sql = allMigrationsSql();
    expect(sql).toMatch(/check \(module in \('glucose', 'body'\)\)/);
  });
});
