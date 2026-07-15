import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAndRecordAiUsage } from "./rate-limit";

// Stub encadeável mínimo do supabase-js: select(count) e insert.
function fakeSupabase(opts: {
  count: number;
  oldestCreatedAt?: string;
  countError?: { message: string };
}) {
  const inserts: unknown[] = [];

  function builder(kind: "count" | "rows") {
    const chain = {
      eq: () => chain,
      gte: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data: opts.oldestCreatedAt ? { created_at: opts.oldestCreatedAt } : null,
        error: null,
      }),
      then: (
        resolve: (v: { count: number; error: { message: string } | null }) => void
      ) => resolve({ count: opts.count, error: opts.countError ?? null }),
    };
    void kind;
    return chain;
  }

  const client = {
    from: () => ({
      select: (_cols: string, config?: { count?: string }) =>
        builder(config?.count ? "count" : "rows"),
      insert: (row: unknown) => {
        inserts.push(row);
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: "usage-1" }, error: null }),
          }),
        };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };

  return { client: client as unknown as SupabaseClient, inserts };
}

describe("checkAndRecordAiUsage", () => {
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
      // registro mais antigo tem 30 min — libera em ~30 min
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
    const { client, inserts } = fakeSupabase({
      count: 0,
      countError: { message: "db down" },
    });
    const result = await checkAndRecordAiUsage(client, "user-1", "chat");
    expect(result.allowed).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});
