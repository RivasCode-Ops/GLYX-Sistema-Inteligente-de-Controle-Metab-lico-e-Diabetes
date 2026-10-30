import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAndRecordAiUsage, recordAiTokens } from "./rate-limit";

type RespostaRpc = { data: unknown; error: { code?: string; message: string } | null };

// Stub encadeável mínimo do supabase-js: rpc, select(count) e insert.
function fakeSupabase(opts: {
  count?: number;
  oldestCreatedAt?: string;
  countError?: { message: string };
  /** Resposta da RPC. Ausente = a RPC não existe no banco (PGRST202). */
  rpc?: Record<string, RespostaRpc>;
}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const chamadasRpc: { fn: string; args: Record<string, unknown> }[] = [];

  function builder() {
    const chain = {
      eq: () => chain,
      gte: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data: opts.oldestCreatedAt ? { created_at: opts.oldestCreatedAt } : null,
        error: null,
      }),
      then: (resolve: (v: { count: number; error: { message: string } | null }) => void) =>
        resolve({ count: opts.count ?? 0, error: opts.countError ?? null }),
    };
    return chain;
  }

  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      chamadasRpc.push({ fn, args });
      return (
        opts.rpc?.[fn] ?? {
          data: null,
          error: { code: "PGRST202", message: "Could not find the function" },
        }
      );
    },
    from: () => ({
      select: () => builder(),
      insert: (row: unknown) => {
        inserts.push(row);
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: "usage-1" }, error: null }),
          }),
        };
      },
      update: (row: unknown) => {
        updates.push(row);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };

  return { client: client as unknown as SupabaseClient, inserts, updates, chamadasRpc };
}

describe("cota de IA pela RPC atômica (GLYX-24)", () => {
  it("permite e devolve o id do uso registrado pelo banco", async () => {
    const f = fakeSupabase({
      rpc: {
        consumir_cota_ia: {
          data: [{ permitido: true, usados: 4, usage_id: "u-rpc", mais_antigo: null }],
          error: null,
        },
      },
    });
    const r = await checkAndRecordAiUsage(f.client, "user-1", "chat");
    expect(r).toEqual({ allowed: true, usageId: "u-rpc" });
    // Não insere direto: quem grava é a RPC.
    expect(f.inserts).toHaveLength(0);
  });

  it("os limites vêm do servidor, não do cliente", async () => {
    const f = fakeSupabase({
      rpc: { consumir_cota_ia: { data: [{ permitido: true, usage_id: "x", mais_antigo: null }], error: null } },
    });
    await checkAndRecordAiUsage(f.client, "user-1", "body_photo");
    expect(f.chamadasRpc[0]).toEqual({
      fn: "consumir_cota_ia",
      args: { p_kind: "body_photo", p_limite: 5, p_janela_segundos: 3600 },
    });
  });

  it("recusa com tempo de espera calculado do registro mais antigo", async () => {
    const maisAntigo = new Date(Date.now() - 50 * 60_000).toISOString();
    const f = fakeSupabase({
      rpc: {
        consumir_cota_ia: {
          data: [{ permitido: false, usados: 30, usage_id: null, mais_antigo: maisAntigo }],
          error: null,
        },
      },
    });
    const r = await checkAndRecordAiUsage(f.client, "user-1", "chat");
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.retryAfterMinutes).toBeGreaterThanOrEqual(9);
      expect(r.retryAfterMinutes).toBeLessThanOrEqual(11);
    }
  });

  it("erro da RPC (que não seja ausência) falha fechado, sem cair no caminho antigo", async () => {
    const f = fakeSupabase({
      count: 0,
      rpc: { consumir_cota_ia: { data: null, error: { code: "57014", message: "timeout" } } },
    });
    const r = await checkAndRecordAiUsage(f.client, "user-1", "chat");
    expect(r.allowed).toBe(false);
    expect(f.inserts).toHaveLength(0);
  });

  it("tokens vão pela RPC que só toca linha própria", async () => {
    const f = fakeSupabase({ rpc: { registrar_tokens_ia: { data: null, error: null } } });
    await recordAiTokens(f.client, "u-rpc", { prompt_tokens: 10, completion_tokens: 5 }, "modelo");
    expect(f.chamadasRpc[0].fn).toBe("registrar_tokens_ia");
    expect(f.updates).toHaveLength(0);
  });
});

describe("caminho legado — só enquanto a migration da RPC não estiver aplicada", () => {
  it("permite e registra quando abaixo do limite", async () => {
    const { client, inserts } = fakeSupabase({ count: 3 });
    const result = await checkAndRecordAiUsage(client, "user-1", "chat");
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.usageId).toBe("usage-1");
    }
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ user_id: "user-1", kind: "chat" });
  });

  it("bloqueia no limite com tempo de espera e sem registrar", async () => {
    const oldest = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { client, inserts } = fakeSupabase({ count: 30, oldestCreatedAt: oldest });
    const result = await checkAndRecordAiUsage(client, "user-1", "chat");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.limit).toBe(30);
      expect(result.retryAfterMinutes).toBeGreaterThanOrEqual(29);
      expect(result.retryAfterMinutes).toBeLessThanOrEqual(31);
    }
    expect(inserts).toHaveLength(0);
  });

  it("limites diferentes por tipo: foto bloqueia com 10", async () => {
    const { client, inserts } = fakeSupabase({ count: 10 });
    const result = await checkAndRecordAiUsage(client, "user-1", "meal_photo");
    expect(result.allowed).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("fail-closed quando a contagem falha", async () => {
    const { client, inserts } = fakeSupabase({ count: 0, countError: { message: "db down" } });
    const result = await checkAndRecordAiUsage(client, "user-1", "chat");
    expect(result.allowed).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});
