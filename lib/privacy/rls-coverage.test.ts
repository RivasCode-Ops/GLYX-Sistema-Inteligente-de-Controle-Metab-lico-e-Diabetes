import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { USER_DATA_DELETE_ORDER, USER_DATA_EXPORT_TABLES } from "./user-data";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function loadAllMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

/** Tabelas com user_id criadas no schema (exceto ai_messages: limpeza via cascade). */
const CLINICAL_TABLES_WITH_USER_ID = [
  "glucose_readings",
  "meals",
  "medications",
  "medication_logs",
  "exercise_sessions",
  "metabolic_alerts",
  "exams",
  "ai_threads",
  "ai_messages",
  "health_snapshots",
  "insight_findings",
  "metabolic_audits",
  "insulin_logs",
  "ai_usage",
  "push_subscriptions",
  "push_dispatch_log",
  "weight_logs",
  "water_logs",
  "cgm_connections",
  "google_fit_connections",
  "medication_snoozes",
  "muscle_pauses",
  "strength_logs",
] as const;

describe("cobertura RLS nas migrations", () => {
  const sql = loadAllMigrationsSql();

  it.each(CLINICAL_TABLES_WITH_USER_ID)(
    "%s tem RLS habilitado e policy com auth.uid()",
    (table) => {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`, "i")
      );
      // Policy referenciando a tabela e amarrada ao usuário autenticado.
      expect(sql).toMatch(
        new RegExp(`on public\\.${table}[\\s\\S]{0,500}auth\\.uid\\(\\)`, "i")
      );
    }
  );

  it("profiles usa RLS por id = auth.uid()", () => {
    expect(sql).toMatch(/alter table public\.profiles\s+enable row level security/i);
    expect(sql).toMatch(/on public\.profiles[\s\S]{0,300}auth\.uid\(\)\s*=\s*id/i);
  });
});

describe("inventário LGPD vs schema", () => {
  it("toda tabela clínica (exceto cascade) está no wipe", () => {
    const cascadeHandled = new Set(["ai_messages"]);
    for (const table of CLINICAL_TABLES_WITH_USER_ID) {
      if (cascadeHandled.has(table)) continue;
      expect(USER_DATA_DELETE_ORDER as readonly string[]).toContain(table);
    }
  });

  it("wipe e export cobrem o mesmo conjunto clínico (+ profiles/messages no export)", () => {
    for (const table of USER_DATA_DELETE_ORDER) {
      expect(USER_DATA_EXPORT_TABLES as readonly string[]).toContain(table);
    }
    expect(USER_DATA_EXPORT_TABLES as readonly string[]).toContain("profiles");
    expect(USER_DATA_EXPORT_TABLES as readonly string[]).toContain("ai_messages");
  });
});
