import { describe, expect, it } from "vitest";
import {
  MAX_SNOOZE_ATTEMPTS,
  decideSnooze,
  snoozeActionsFor,
  type SnoozeInput,
} from "./snooze-rules";

const TZ = "America/Sao_Paulo";

function local(dia: number, hora: number, minuto = 0): Date {
  return new Date(Date.UTC(2026, 8, dia, hora + 3, minuto));
}

function entrada(over: Partial<SnoozeInput> = {}): SnoozeInput {
  return {
    strictness: "rigido",
    scheduledFor: local(7, 8),
    attemptsUsed: 0,
    now: local(7, 8, 5),
    timeZone: TZ,
    ...over,
  };
}

describe("adiar grava uma tentativa nova", () => {
  it("a primeira tentativa é 1", () => {
    const d = decideSnooze(entrada());
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.attempt).toBe(1);
  });

  it("adiar de novo incrementa em vez de atualizar", () => {
    const d = decideSnooze(entrada({ attemptsUsed: 1 }));
    if (!d.allowed) throw new Error("deveria permitir");
    expect(d.attempt).toBe(2);
  });

  /**
   * `snoozed_until` é calculado uma vez e não se move. O job não recalcula
   * (medido: ele só faz `set fired = true`), e o unique no banco impede
   * regravação da mesma tentativa. Aqui se prova a metade determinística:
   * decidir de novo com o MESMO `now` dá o MESMO horário.
   */
  it("o horário é função de now e minutos, não do número de ciclos do job", () => {
    const base = entrada();
    const a = decideSnooze(base);
    const b = decideSnooze(base);
    const c = decideSnooze(base);
    if (!a.allowed || !b.allowed || !c.allowed) throw new Error("deveriam permitir");
    expect(b.snoozedUntil.toISOString()).toBe(a.snoozedUntil.toISOString());
    expect(c.snoozedUntil.toISOString()).toBe(a.snoozedUntil.toISOString());
  });

  it("o padrão são 15 minutos", () => {
    const d = decideSnooze(entrada());
    if (!d.allowed) throw new Error("deveria permitir");
    expect(d.snoozedUntil.getTime() - local(7, 8, 5).getTime()).toBe(15 * 60_000);
  });
});

describe("limite de adiamentos por dose", () => {
  it(`o ${MAX_SNOOZE_ATTEMPTS + 1}º é recusado`, () => {
    const d = decideSnooze(entrada({ attemptsUsed: MAX_SNOOZE_ATTEMPTS }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("limite");
  });

  it("atingido o limite, o card perde a ação de adiar e ganha Pulei hoje", () => {
    const noLimite = decideSnooze(entrada({ attemptsUsed: MAX_SNOOZE_ATTEMPTS }));
    expect(snoozeActionsFor(noLimite)).toEqual(["registrei", "pulei_hoje"]);
    expect(snoozeActionsFor(noLimite)).not.toContain("adiar");
  });

  it("antes do limite, as três ações estão disponíveis", () => {
    expect(snoozeActionsFor(decideSnooze(entrada()))).toEqual([
      "registrei",
      "adiar",
      "pulei_hoje",
    ]);
  });
});

describe("o adiamento morre com o dia", () => {
  it("dose de ontem não pode ser adiada hoje", () => {
    const d = decideSnooze(entrada({ scheduledFor: local(6, 22), now: local(7, 0, 10) }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("dia_virado");
  });

  it("a virada é a do fuso do usuário, não a do servidor", () => {
    // 03:00 UTC de 08/09 ainda é 00:00 de 08/09 em São Paulo — dia novo lá
    // também, então a dose do dia 7 já não vale.
    const d = decideSnooze(entrada({ scheduledFor: local(7, 22), now: local(8, 0, 30) }));
    expect(d.allowed).toBe(false);
  });
});

describe("item livre", () => {
  it("não expõe adiamento", () => {
    const d = decideSnooze(entrada({ strictness: "livre" }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("livre");
    expect(snoozeActionsFor(d)).not.toContain("adiar");
  });
});

describe("nenhum job cria adiamento", () => {
  /**
   * Invariante de arquitetura: linha em `medication_snoozes` só nasce de ação
   * explícita do usuário. O guardião real é o SQL — este teste afirma o
   * contrato do lado do TypeScript: `decideSnooze` exige `scheduledFor` e
   * `attemptsUsed`, valores que só existem no contexto de um pedido, e não tem
   * caminho que produza adiamento a partir de tempo passando.
   */
  it("a decisão exige contexto de pedido, não só o relógio", () => {
    const d = decideSnooze(entrada({ attemptsUsed: 0 }));
    expect(d.allowed).toBe(true);
    // Mesmo relógio, dose já adiada 3 vezes: nada de novo nasce.
    const esgotado = decideSnooze(entrada({ attemptsUsed: MAX_SNOOZE_ATTEMPTS }));
    expect(esgotado.allowed).toBe(false);
  });
});
