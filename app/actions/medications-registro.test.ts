import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalsoDeDoses } from "@/lib/medications/banco-falso-doses";
import { lerConflito, urlDoConflito } from "@/lib/medications/conflito-registro";

// Caminho da TELA (ação do servidor), com banco falso em memória. Nenhuma rede.
const estado = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => estado.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { logMedicationTaken } from "./medications";

const MED = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "pessoa-sintetica",
  reminder_times: ["08:00", "20:00"],
  timing_strictness: "rigido",
  grace_minutes: null,
};
/** 14/10/2026 em São Paulo (UTC-3) — no passado, então aceito como "tomei às". */
const SP = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 14, h + 3, m)).toISOString();
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: ReturnType<typeof bancoFalsoDeDoses>;
beforeEach(() => {
  db = bancoFalsoDeDoses({ modo: "novo", med: MED });
  estado.cliente = db.cliente;
});

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  f.set("medication_id", MED.id);
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

describe("tela — Registrar dose", () => {
  it("o mesmo formulário enviado duas vezes (mesmo pedido) registra uma tomada", async () => {
    expect(await logMedicationTaken(form({ pedido: P1, taken_at_iso: SP(8, 5) }))).toEqual({ ok: true });
    expect(await logMedicationTaken(form({ pedido: P1, taken_at_iso: SP(8, 5) }))).toEqual({ ok: true });
    expect(db.logs).toHaveLength(1);
  });

  it("outro registro na mesma dose devolve o conflito para a pergunta, e a URL ida-e-volta preserva tudo", async () => {
    await logMedicationTaken(form({ pedido: P1, taken_at_iso: SP(8, 0) }));
    const r = await logMedicationTaken(form({ pedido: P2, taken_at_iso: SP(13, 0) }));
    expect(r.conflito).toEqual({ medicationId: MED.id, scheduledFor: SP(8), takenAtPedido: SP(13), pedido: P2 });
    const volta = lerConflito(Object.fromEntries(new URL(urlDoConflito(r.conflito!), "http://x").searchParams));
    expect(volta).toEqual(r.conflito);
    expect(db.logs).toHaveLength(1);
  });

  it("resposta 'corrigir' altera aquela tomada e guarda a anterior", async () => {
    await logMedicationTaken(form({ pedido: P1, taken_at_iso: SP(8, 0) }));
    const r = await logMedicationTaken(form({ pedido: P2, taken_at_iso: SP(9, 0), intencao: "corrigir", alvo_id: "log-1" }));
    expect(r).toEqual({ ok: true });
    expect(db.logs).toHaveLength(1);
    expect(db.logs[0].taken_at).toBe(SP(9));
    expect(db.logs[0].correcoes).toHaveLength(1);
  });

  it("resposta 'outra' grava a tomada a mais", async () => {
    await logMedicationTaken(form({ pedido: P1, taken_at_iso: SP(8, 0) }));
    expect(await logMedicationTaken(form({ pedido: P2, taken_at_iso: SP(13, 0), intencao: "outra" }))).toEqual({ ok: true });
    expect(db.logs.map((l) => l.adherence_status)).toEqual(["no_horario", "adicional"]);
  });

  it("instante informado no futuro é ignorado (vale a hora do envio), sem recusar o registro", async () => {
    const futuro = new Date(Date.now() + 3_600_000).toISOString();
    expect(await logMedicationTaken(form({ pedido: P1, taken_at_iso: futuro }))).toEqual({ ok: true });
    expect(new Date(db.logs[0].taken_at as string).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
