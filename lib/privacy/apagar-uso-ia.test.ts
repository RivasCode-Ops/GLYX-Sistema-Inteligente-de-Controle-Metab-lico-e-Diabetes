import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { apagarUsoDeIa } from "./apagar-uso-ia";

// D4 (aprovada em 15/10/2026): a exclusão apaga TODO o histórico de uso de IA.
function adminFalso(erro: { code: string } | null = null) {
  const chamadas: { tabela: string; filtros: [string, string, unknown][] }[] = [];
  const admin = {
    from(tabela: string) {
      const c = { tabela, filtros: [] as [string, string, unknown][] };
      chamadas.push(c);
      const q = {
        delete() {
          return q;
        },
        eq(col: string, v: unknown) {
          c.filtros.push(["eq", col, v]);
          return Promise.resolve({ error: erro });
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { admin, chamadas };
}

describe("exclusão do histórico de uso de IA (D4)", () => {
  it("apaga todas as linhas da pessoa, sem corte de data", async () => {
    const { admin, chamadas } = adminFalso();
    expect(await apagarUsoDeIa(admin, "u1")).toBeNull();
    expect(chamadas).toEqual([{ tabela: "ai_usage", filtros: [["eq", "user_id", "u1"]] }]);
  });

  it("sem chave de serviço, avisa em vez de dizer que apagou tudo", async () => {
    expect(await apagarUsoDeIa(null, "u1")).toBe("Falha ao apagar o histórico de uso de IA.");
  });

  it("falha do banco aparece", async () => {
    const { admin } = adminFalso({ code: "XX000" });
    expect(await apagarUsoDeIa(admin, "u1")).toBe("Falha ao apagar o histórico de uso de IA.");
  });

  it("a ação de exclusão usa a chave de serviço e não há RPC chamável à parte", () => {
    const acao = readFileSync(join(process.cwd(), "app", "actions", "privacy.ts"), "utf8");
    expect(acao).toMatch(/apagarUsoDeIa\(createAdminClient\(\), user\.id\)/);
    expect(acao).not.toMatch(/apagar_meu_uso_de_ia/);
  });
});
