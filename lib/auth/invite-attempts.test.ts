import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  LIMITE_FALHAS_CONVITE,
  chaveDaRequisicao,
  podeTentarConvite,
  registrarFalhaDeConvite,
} from "./invite-attempts";

// Etapa 1, A8: limite de tentativas de convite, sem guardar o IP.

function admin(resposta: { data?: unknown; error: { code?: string; message: string } | null }) {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const c = {
    rpc: async (fn: string, args: Record<string, unknown>) => (chamadas.push({ fn, args }), resposta),
  };
  return { cliente: c as unknown as SupabaseClient, chamadas };
}

describe("chaveDaRequisicao", () => {
  it("usa o primeiro IP encaminhado e nunca o devolve em claro", () => {
    const chave = chaveDaRequisicao(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(chave).toMatch(/^[0-9a-f]{64}$/);
    expect(chave).not.toContain("203.0.113.7");
  });

  it("mesmo IP, mesma chave; IPs diferentes, chaves diferentes", () => {
    const a = chaveDaRequisicao(new Headers({ "x-forwarded-for": "203.0.113.7" }));
    const b = chaveDaRequisicao(new Headers({ "x-real-ip": "203.0.113.7" }));
    const c = chaveDaRequisicao(new Headers({ "x-forwarded-for": "198.51.100.2" }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("podeTentarConvite", () => {
  it("abaixo do limite pode; no limite não pode", async () => {
    expect(await podeTentarConvite(admin({ data: true, error: null }).cliente, "k")).toBe(true);
    expect(await podeTentarConvite(admin({ data: false, error: null }).cliente, "k")).toBe(false);
  });

  it("manda o limite e a janela definidos no servidor", async () => {
    const a = admin({ data: true, error: null });
    await podeTentarConvite(a.cliente, "k");
    expect(a.chamadas[0]).toEqual({
      fn: "convite_pode_tentar",
      args: { p_chave: "k", p_limite: LIMITE_FALHAS_CONVITE, p_janela_segundos: 3600 },
    });
  });

  it("sem a migration ainda aplicada, deixa passar (o código continua sendo conferido)", async () => {
    const r = await podeTentarConvite(
      admin({ error: { code: "PGRST202", message: "not found" } }).cliente,
      "k"
    );
    expect(r).toBe(true);
  });
});

describe("registrarFalhaDeConvite", () => {
  it("registra só a chave", async () => {
    const a = admin({ data: null, error: null });
    await registrarFalhaDeConvite(a.cliente, "k");
    expect(a.chamadas).toEqual([{ fn: "convite_registrar_falha", args: { p_chave: "k" } }]);
  });
});
