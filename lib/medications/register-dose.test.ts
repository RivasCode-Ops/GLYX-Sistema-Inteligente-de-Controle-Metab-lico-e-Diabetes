import { describe, expect, it } from "vitest";
import { bancoFalsoDeDoses } from "./banco-falso-doses";
import { MENSAGENS_REGISTRO, registrarDose, restricaoViolada, type EntradaRegistro } from "./register-dose";

const PESSOA = "pessoa-sintetica";
const MED = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: PESSOA,
  reminder_times: ["08:00", "20:00"],
  timing_strictness: "rigido",
  grace_minutes: null,
};
/** 14/10/2026 em São Paulo (UTC-3). */
const SP = (h: number, m = 0, s = 0) => new Date(Date.UTC(2026, 9, 14, h + 3, m, s));
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const banco = (modo: "novo" | "antigo" = "novo", corte?: Date) => bancoFalsoDeDoses({ modo, med: MED, corte });
const registrar = (db: ReturnType<typeof banco>, e: Partial<EntradaRegistro>) =>
  registrarDose(db.cliente, PESSOA, { medicationId: MED.id, confirmed: true, ...e });

describe("registro de dose — reenvio da mesma ação (pedido)", () => {
  it("rotula, grava a dose prevista e guarda o pedido", async () => {
    const db = banco();
    const r = await registrar(db, { takenAt: SP(8, 5), pedido: P1 });
    expect(r).toEqual({ ok: true, resultado: "registrado" });
    expect(db.logs[0]).toMatchObject({
      scheduled_for: SP(8).toISOString(),
      adherence_status: "no_horario",
      client_request_id: P1,
    });
  });

  it("o mesmo pedido enviado de novo não cria outra tomada", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 5), pedido: P1 });
    const r = await registrar(db, { takenAt: SP(8, 5), pedido: P1 });
    expect(r).toEqual({ ok: true, resultado: "reenvio" });
    expect(db.logs).toHaveLength(1);
  });

  it("dois envios SIMULTÂNEOS do mesmo pedido: uma tomada; o índice do pedido resolve a corrida", async () => {
    const db = banco();
    const rs = await Promise.all([
      registrar(db, { takenAt: SP(8, 5), pedido: P1 }),
      registrar(db, { takenAt: SP(8, 5), pedido: P1 }),
    ]);
    expect(db.logs).toHaveLength(1);
    expect(rs.map((r) => (r.ok ? r.resultado : "conflito")).sort()).toEqual(["reenvio", "registrado"]);
  });

  it("pedido malformado é ignorado (não vira identidade)", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 5), pedido: "nao-e-uuid" });
    expect(db.logs[0].client_request_id).toBeUndefined();
  });
});

describe("registro de dose — já existe tomada na dose: a pessoa decide", () => {
  it("pedido diferente com horário diferente NÃO é descartado nem vira avulso: é conflito, e nada é gravado", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 0), pedido: P1 });
    const r = await registrar(db, { takenAt: SP(13, 0), pedido: P2 });
    expect(r).toMatchObject({
      ok: false,
      conflito: { scheduledFor: SP(8).toISOString(), takenAtPedido: SP(13).toISOString() },
    });
    expect(r.ok === false && "conflito" in r && r.conflito.existentes).toEqual([{ id: "log-1", takenAt: SP(8).toISOString() }]);
    expect(db.logs).toHaveLength(1);
  });

  it("dois pedidos DIFERENTES simultâneos na mesma dose: uma tomada e um conflito explícito (não silencioso)", async () => {
    const db = banco();
    const rs = await Promise.all([
      registrar(db, { takenAt: SP(8, 5), pedido: P1 }),
      registrar(db, { takenAt: SP(8, 6), pedido: P2 }),
    ]);
    expect(db.logs).toHaveLength(1);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok && "conflito" in r)).toHaveLength(1);
  });

  it("CORRIGIR: altera a tomada, guarda o valor anterior e não cria linha", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 0), pedido: P1 });
    const r = await registrar(db, { takenAt: SP(9, 30), pedido: P2, intencao: "corrigir", alvoId: "log-1" });
    expect(r).toEqual({ ok: true, resultado: "corrigido" });
    expect(db.logs).toHaveLength(1);
    expect(db.logs[0]).toMatchObject({ taken_at: SP(9, 30).toISOString(), adherence_status: "atrasado", correcao_pedido: P2 });
    expect(db.logs[0].correcoes).toEqual([
      expect.objectContaining({ pedido: P2, taken_at_anterior: SP(8).toISOString(), rotulo_anterior: "no_horario" }),
    ]);
  });

  it("a mesma correção reenviada não altera de novo nem duplica o histórico", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 0), pedido: P1 });
    await registrar(db, { takenAt: SP(9, 30), pedido: P2, intencao: "corrigir", alvoId: "log-1" });
    const r = await registrar(db, { takenAt: SP(9, 30), pedido: P2, intencao: "corrigir", alvoId: "log-1" });
    expect(r).toEqual({ ok: true, resultado: "reenvio" });
    expect(db.logs[0].correcoes).toHaveLength(1);
  });

  it("corrigir para o horário de OUTRA dose já ocupada é recusado com motivo, sem alterar nada", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 0), pedido: P1 });
    // 20:05, não 20:00: a janela da dose das 08:00 vai ATÉ 20:00 inclusive.
    expect(await registrar(db, { takenAt: SP(20, 5), pedido: P2 })).toEqual({ ok: true, resultado: "registrado" });
    const r = await registrar(db, { takenAt: SP(20, 30), pedido: P3, intencao: "corrigir", alvoId: "log-1" });
    expect(r).toEqual({ ok: false, erro: MENSAGENS_REGISTRO.outra_na_dose_nova, status: 409 });
    expect(db.logs[0].taken_at).toBe(SP(8).toISOString());
  });

  it("OUTRA TOMADA: linha nova `adicional`, sem dose prevista; reenvio dela não duplica", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 0), pedido: P1 });
    const r = await registrar(db, { takenAt: SP(13, 0), pedido: P2, intencao: "outra" });
    expect(r).toEqual({ ok: true, resultado: "adicional" });
    expect(db.logs[1]).toMatchObject({ adherence_status: "adicional", scheduled_for: null, taken_at: SP(13).toISOString() });
    expect(await registrar(db, { takenAt: SP(13, 0), pedido: P2, intencao: "outra" })).toEqual({ ok: true, resultado: "reenvio" });
    expect(db.logs).toHaveLength(2);
  });

  it("'Pulei hoje' não entra na disputa de dose", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 0), pedido: P1 });
    const r = await registrar(db, { confirmed: false, takenAt: SP(8, 5), pedido: P2 });
    expect(r).toEqual({ ok: true, resultado: "registrado" });
    expect(db.logs[1]).toMatchObject({ confirmed: false, adherence_status: "fora_janela" });
  });
});

describe("registro de dose — ciclo do pedido", () => {
  it("o mesmo pedido não vira as DUAS decisões: 'outra tomada' e depois 'corrigir' é recusado", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 0), pedido: P1 });
    expect(await registrar(db, { takenAt: SP(13), pedido: P2, intencao: "outra" })).toEqual({ ok: true, resultado: "adicional" });
    const r = await registrar(db, { takenAt: SP(13), pedido: P2, intencao: "corrigir", alvoId: "log-1" });
    expect(r).toEqual({ ok: false, erro: MENSAGENS_REGISTRO.acao_ja_resolvida, status: 409 });
    expect(db.logs[0].taken_at).toBe(SP(8).toISOString());
    expect(db.logs).toHaveLength(2);
  });

  it("…e 'corrigir' e depois 'outra tomada' também é recusado", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 0), pedido: P1 });
    await registrar(db, { takenAt: SP(9), pedido: P2, intencao: "corrigir", alvoId: "log-1" });
    const r = await registrar(db, { takenAt: SP(9), pedido: P2, intencao: "outra" });
    expect(r).toEqual({ ok: false, erro: MENSAGENS_REGISTRO.acao_ja_resolvida, status: 409 });
    expect(db.logs).toHaveLength(1);
  });

  it("o pedido do envio inicial que deu conflito pode ser usado na resposta (nada foi gravado com ele)", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 0), pedido: P1 });
    const conflito = await registrar(db, { takenAt: SP(13), pedido: P2 });
    expect(conflito.ok).toBe(false);
    expect(await registrar(db, { takenAt: SP(13), pedido: P2, intencao: "outra" })).toEqual({ ok: true, resultado: "adicional" });
  });

  it("reabrir a tela gera pedido novo: a dose já tomada vira pergunta, não duplicata", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(8, 5), pedido: P1 });
    const r = await registrar(db, { takenAt: SP(8, 7), pedido: P3 });
    expect(r.ok === false && "conflito" in r).toBe(true);
    expect(db.logs).toHaveLength(1);
  });

  it("o pedido de OUTRA pessoa não vale como reenvio nem dá acesso ao registro dela", async () => {
    const db = banco();
    db.logs.push({ id: "de-outra", user_id: "outra-pessoa", medication_id: "outro-med", client_request_id: P1, confirmed: true, taken_at: SP(8).toISOString(), scheduled_for: SP(8).toISOString(), correcoes: [] });
    expect(await registrar(db, { takenAt: SP(8, 5), pedido: P1 })).toEqual({ ok: true, resultado: "registrado" });
    const r = await registrar(db, { takenAt: SP(9), pedido: P2, intencao: "corrigir", alvoId: "de-outra" });
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(db.logs.find((l) => l.id === "de-outra")?.taken_at).toBe(SP(8).toISOString());
  });
});

describe("registro de dose — histórico anterior ao corte (D14, opção B)", () => {
  it("registro antigo na mesma dose: o índice não o vê, mas o app pergunta; com 'outra', grava a mais", async () => {
    const corte = new Date(Date.now() + 1000); // linha criada agora fica ANTES do corte
    const db = bancoFalsoDeDoses({ modo: "novo", med: MED, corte });
    db.logs.push({ id: "antiga", user_id: PESSOA, medication_id: MED.id, confirmed: true, taken_at: SP(8).toISOString(), scheduled_for: SP(8).toISOString(), created_at: "2026-09-08T12:00:00Z" });
    const r1 = await registrar(db, { takenAt: SP(13), pedido: P1 });
    expect(r1.ok === false && "conflito" in r1).toBe(true);
    const r2 = await registrar(db, { takenAt: SP(13), pedido: P1, intencao: "outra" });
    expect(r2).toEqual({ ok: true, resultado: "adicional" });
  });
});

describe("registro de dose — banco anterior à migration (código implantado antes)", () => {
  it("registra sem guardar o pedido", async () => {
    const db = banco("antigo");
    const r = await registrar(db, { takenAt: SP(8, 5), pedido: P1 });
    expect(r).toEqual({ ok: true, resultado: "registrado" });
    expect(db.logs[0].client_request_id).toBeUndefined();
  });

  it("conflito continua explícito (pela dose, já que o pedido não fica guardado)", async () => {
    const db = banco("antigo");
    await registrar(db, { takenAt: SP(8, 5), pedido: P1 });
    const r = await registrar(db, { takenAt: SP(8, 5), pedido: P1 });
    expect(r.ok === false && "conflito" in r).toBe(true);
    expect(db.logs).toHaveLength(1);
  });

  it("correção fica INDISPONÍVEL — nunca sobrescreve sem histórico", async () => {
    const db = banco("antigo");
    await registrar(db, { takenAt: SP(8, 0) });
    const r = await registrar(db, { takenAt: SP(9), pedido: P2, intencao: "corrigir", alvoId: "log-1" });
    expect(r).toEqual({ ok: false, erro: MENSAGENS_REGISTRO.correcao_indisponivel, status: 409 });
    expect(db.logs[0].taken_at).toBe(SP(8).toISOString());
  });

  it("outra tomada é gravada sem dose prevista, com o rótulo antigo `fora_janela`", async () => {
    const db = banco("antigo");
    await registrar(db, { takenAt: SP(8, 0) });
    const r = await registrar(db, { takenAt: SP(13), intencao: "outra" });
    expect(r).toEqual({ ok: true, resultado: "adicional" });
    expect(db.logs[1]).toMatchObject({ scheduled_for: null, adherence_status: "fora_janela" });
  });
});

describe("registro de dose — regras que continuam", () => {
  it("a dose anunciada pela notificação vence o palpite pela hora", async () => {
    // Alarme das 08:00 tocado só às 21:00: pela hora, casaria com a das 20:00.
    const db = banco();
    await registrar(db, { takenAt: SP(21), doseInformada: SP(8).toISOString() });
    expect(db.logs[0]).toMatchObject({ scheduled_for: SP(8).toISOString(), adherence_status: "atrasado" });
  });

  it("dose anunciada que não é horário do item é ignorada", async () => {
    const db = banco();
    await registrar(db, { takenAt: SP(20, 10), doseInformada: SP(13, 37).toISOString() });
    expect(db.logs[0]).toMatchObject({ scheduled_for: SP(20).toISOString() });
  });

  it("medicamento de outra conta (ou inexistente) é 404 e nada é gravado", async () => {
    const db = banco();
    const r = await registrarDose(db.cliente, PESSOA, { medicationId: "22222222-2222-4222-8222-222222222222", confirmed: true });
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(db.logs).toHaveLength(0);
  });
});

describe("erros do banco: código + identificador da restrição, nunca só o texto", () => {
  // Formato do PostgREST: { code, message, details, hint } — valores sanitizados.
  const pedido = { code: "23505", message: 'duplicate key value violates unique constraint "medication_logs_pedido_unico"', details: "Key (user_id, client_request_id)=(…, …) already exists.", hint: null };
  const dose = { code: "23505", message: 'duplicate key value violates unique constraint "medication_logs_dose_confirmada_unica"', details: "Key (user_id, medication_id, scheduled_for)=(…, …, …) already exists.", hint: null };

  it("reconhece pedido e dose pelo nome da restrição", () => {
    expect(restricaoViolada(pedido)).toBe("pedido");
    expect(restricaoViolada(dose)).toBe("dose");
  });
  it("reconhece pela lista de colunas em `details` quando a mensagem vier sem o nome", () => {
    expect(restricaoViolada({ ...dose, message: "duplicate key" })).toBe("dose");
  });
  it("OUTRA violação de unicidade (ex.: chave primária) não é conflito de dose", () => {
    expect(restricaoViolada({ code: "23505", message: 'duplicate key value violates unique constraint "medication_logs_pkey"', details: "Key (id)=(…) already exists.", hint: null })).toBeNull();
  });
  it("mesmo nome com código diferente não conta", () => {
    expect(restricaoViolada({ ...dose, code: "23514" })).toBeNull();
  });
  it("outro CHECK não aciona o recuo do rótulo `adicional`", () => {
    expect(restricaoViolada({ code: "23514", message: 'violates check constraint "outra_regra"', details: null, hint: null })).toBeNull();
  });
  it("RLS (42501) não é nenhuma das três", () => {
    expect(restricaoViolada({ code: "42501", message: 'new row violates row-level security policy for table "medication_logs"', details: null, hint: null })).toBeNull();
  });

  it("violação de unicidade que não é da dose vira falha genérica, não pergunta", async () => {
    const db = banco();
    const original = db.cliente.from.bind(db.cliente);
    (db.cliente as unknown as { from: (t: string) => unknown }).from = (t: string) => {
      const b = original(t) as unknown as Record<string, unknown>;
      if (t === "medication_logs") {
        b.insert = async () => ({ error: { code: "23505", message: 'duplicate key value violates unique constraint "medication_logs_pkey"', details: "Key (id)=(…) already exists.", hint: null } });
      }
      return b;
    };
    const r = await registrar(db, { takenAt: SP(8, 5), pedido: P1 });
    expect(r).toEqual({ ok: false, erro: MENSAGENS_REGISTRO.falha_gravacao, status: 500 });
  });
});
