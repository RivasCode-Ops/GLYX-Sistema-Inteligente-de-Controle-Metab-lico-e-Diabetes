import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { definirContaDesativada } from "./definir-desativada";

// GLYX-18: o admin muda só `disabled`, pela RPC; recuo enquanto ela não existe.

type Erro = { code: string; message: string } | null;

function cliente(rpc: { data?: unknown; error: Erro }, update?: { data: unknown[] | null; error: Erro }) {
  const chamadas: string[] = [];
  const c = {
    rpc: async (nome: string) => (chamadas.push(`rpc:${nome}`), rpc),
    from: (tabela: string) => {
      chamadas.push(`from:${tabela}`);
      const b = {
        update: () => b,
        eq: () => b,
        select: async () => update ?? { data: [], error: null },
      };
      return b;
    },
  };
  return { cliente: c as unknown as SupabaseClient, chamadas };
}

describe("definirContaDesativada", () => {
  it("com a migration aplicada, usa só a RPC", async () => {
    const { cliente: c, chamadas } = cliente({ data: true, error: null });
    expect(await definirContaDesativada(c, "alvo", true)).toBe("ok");
    expect(chamadas).toEqual(["rpc:admin_definir_conta_desativada"]);
  });

  it("RPC recusando quem não é admin vira sem_permissao, sem tentar o caminho antigo", async () => {
    const { cliente: c, chamadas } = cliente({ error: { code: "42501", message: "sem permissão" } });
    expect(await definirContaDesativada(c, "alvo", true)).toBe("sem_permissao");
    expect(chamadas).not.toContain("from:profiles");
  });

  it("conta inexistente (RPC devolve false) é falha, não sucesso", async () => {
    const { cliente: c } = cliente({ data: false, error: null });
    expect(await definirContaDesativada(c, "alvo", true)).toBe("falha_alterar");
  });

  it("sem a migration (PGRST202), recua para o UPDATE antigo", async () => {
    const { cliente: c, chamadas } = cliente(
      { error: { code: "PGRST202", message: "function not found" } },
      { data: [{ id: "alvo" }], error: null }
    );
    expect(await definirContaDesativada(c, "alvo", false)).toBe("ok");
    expect(chamadas).toEqual(["rpc:admin_definir_conta_desativada", "from:profiles"]);
  });

  it("no recuo, zero linhas alteradas continua sendo recusa", async () => {
    const { cliente: c } = cliente(
      { error: { code: "PGRST202", message: "function not found" } },
      { data: [], error: null }
    );
    expect(await definirContaDesativada(c, "alvo", true)).toBe("sem_permissao");
  });

  it("outro erro da RPC não cai no recuo", async () => {
    const { cliente: c, chamadas } = cliente({ error: { code: "XX000", message: "falha" } });
    expect(await definirContaDesativada(c, "alvo", true)).toBe("falha_alterar");
    expect(chamadas).not.toContain("from:profiles");
  });
});
