import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalsoDeDoses } from "@/lib/medications/banco-falso-doses";

// Caminho da NOTIFICAÇÃO ("Já tomei"), com banco falso em memória. Nenhuma rede.
const estado = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => estado.cliente }));

import { POST } from "./route";

const MED = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "pessoa-sintetica",
  reminder_times: ["08:00", "20:00"],
  timing_strictness: "rigido",
  grace_minutes: null,
};
const DOSE_08 = new Date(Date.UTC(2026, 9, 14, 11, 0)).toISOString();
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: ReturnType<typeof bancoFalsoDeDoses>;
beforeEach(() => {
  db = bancoFalsoDeDoses({ modo: "novo", med: MED });
  estado.cliente = db.cliente;
});

const tocar = (corpo: Record<string, unknown>) =>
  POST(new Request("http://teste.local/api/medications/taken", { method: "POST", body: JSON.stringify(corpo) }));

describe("notificação — Já tomei", () => {
  it("tocar duas vezes na MESMA notificação (mesmo pedido) registra uma tomada", async () => {
    const r1 = await tocar({ medication_id: MED.id, scheduled_for: DOSE_08, pedido: P1 });
    const r2 = await tocar({ medication_id: MED.id, scheduled_for: DOSE_08, pedido: P1 });
    expect(await r1.json()).toMatchObject({ ok: true, resultado: "registrado" });
    expect(await r2.json()).toMatchObject({ ok: true, resultado: "reenvio", duplicado: true });
    expect(db.logs).toHaveLength(1);
  });

  it("outra notificação para a dose já registrada: 409 com o link da pergunta, nada gravado", async () => {
    await tocar({ medication_id: MED.id, scheduled_for: DOSE_08, pedido: P1 });
    const r = await tocar({ medication_id: MED.id, scheduled_for: DOSE_08, pedido: P2 });
    expect(r.status).toBe(409);
    const corpo = await r.json();
    expect(corpo.conflito).toBe(true);
    expect(corpo.registradaAs).toHaveLength(1);
    expect(corpo.url).toMatch(/^\/medicacao\?conflito=1&med=/);
    expect(corpo.url).toContain(`pedido=${P2}`);
    expect(db.logs).toHaveLength(1);
  });

  it("notificação antiga (sem pedido) tocada duas vezes não grava em silêncio: a segunda é 409", async () => {
    const r1 = await tocar({ medication_id: MED.id, scheduled_for: DOSE_08 });
    const r2 = await tocar({ medication_id: MED.id, scheduled_for: DOSE_08 });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(409);
    expect(db.logs).toHaveLength(1);
  });

  it("dois toques simultâneos de notificações diferentes: uma tomada e um 409", async () => {
    const [a, b] = await Promise.all([
      tocar({ medication_id: MED.id, scheduled_for: DOSE_08, pedido: P1 }),
      tocar({ medication_id: MED.id, scheduled_for: DOSE_08, pedido: P2 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(db.logs).toHaveLength(1);
  });

  it("o conflito da notificação leva o MESMO pedido para a resposta no app, sem nada gravado com ele", async () => {
    await tocar({ medication_id: MED.id, scheduled_for: DOSE_08, pedido: P1 });
    const r = await tocar({ medication_id: MED.id, scheduled_for: DOSE_08, pedido: P2 });
    const url = new URL((await r.json()).url, "http://x");
    expect(url.searchParams.get("pedido")).toBe(P2);
    expect(db.logs.some((l) => l.client_request_id === P2)).toBe(false);
  });

  it("pedido malformado é recusado como payload inválido", async () => {
    const r = await tocar({ medication_id: MED.id, pedido: "nao-e-uuid" });
    expect(r.status).toBe(400);
  });
});
