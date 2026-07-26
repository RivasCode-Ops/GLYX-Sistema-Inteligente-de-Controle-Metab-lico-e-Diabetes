import { describe, expect, it } from "vitest";
import { computePeriodAdherence, localDaysBetween } from "./adherence";

const TZ = "America/Sao_Paulo";

/**
 * Registro feito num horário local de São Paulo, no formato que o banco guarda.
 * Deixa a conversão de fuso com o `Date` (offset explícito -03:00) em vez de
 * somar 3 na hora: às 23h o "+3" estoura o dia e produz uma hora inválida.
 */
function local(day: string, hh: number, mm = 0): { taken_at: string } {
  const iso = `${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`;
  return { taken_at: new Date(iso).toISOString() };
}

describe("localDaysBetween", () => {
  it("inclui as duas pontas", () => {
    expect(localDaysBetween("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });

  it("período invertido devolve vazio em vez de laço infinito", () => {
    expect(localDaysBetween("2026-07-03", "2026-07-01")).toEqual([]);
  });
});

describe("computePeriodAdherence", () => {
  it("conta uma dose por horário agendado casado", () => {
    const r = computePeriodAdherence(
      ["08:00", "20:00"],
      [local("2026-07-01", 8), local("2026-07-01", 20), local("2026-07-02", 8)],
      TZ,
      "2026-07-01",
      "2026-07-02"
    );
    expect(r.expectedDoses).toBe(4);
    expect(r.takenDoses).toBe(3);
    expect(r.unmatchedLogs).toBe(0);
  });

  it("clique duplicado não vira duas doses — era o que inflava o relatório", () => {
    const r = computePeriodAdherence(
      ["08:00"],
      [local("2026-07-01", 8), local("2026-07-01", 8, 1)],
      TZ,
      "2026-07-01",
      "2026-07-01"
    );
    expect(r.expectedDoses).toBe(1);
    expect(r.takenDoses).toBe(1);
    // O segundo registro continua visível, mas como "fora do horário".
    expect(r.unmatchedLogs).toBe(1);
  });

  it("registro até 1h antes do horário conta", () => {
    const r = computePeriodAdherence(
      ["08:00"],
      [local("2026-07-01", 7, 5)],
      TZ,
      "2026-07-01",
      "2026-07-01"
    );
    expect(r.takenDoses).toBe(1);
  });

  it("registro muito antes do horário não conta como aquela dose", () => {
    const r = computePeriodAdherence(
      ["08:00"],
      [local("2026-07-01", 5)],
      TZ,
      "2026-07-01",
      "2026-07-01"
    );
    expect(r.takenDoses).toBe(0);
    expect(r.unmatchedLogs).toBe(1);
  });

  it("dose registrada tarde ainda casa: a janela vai até o próximo horário", () => {
    // Estatina das 19h registrada às 23h54 — bug real que deixava a dose
    // "pendente" pra sempre com janela fixa.
    const r = computePeriodAdherence(
      ["19:00"],
      [local("2026-07-01", 23, 54)],
      TZ,
      "2026-07-01",
      "2026-07-01"
    );
    expect(r.takenDoses).toBe(1);
  });

  it("um registro não cobre duas doses do mesmo dia", () => {
    const r = computePeriodAdherence(
      ["08:00", "12:00"],
      [local("2026-07-01", 8)],
      TZ,
      "2026-07-01",
      "2026-07-01"
    );
    expect(r.expectedDoses).toBe(2);
    expect(r.takenDoses).toBe(1);
  });

  it("remédio sem horário programado não gera dose esperada", () => {
    const r = computePeriodAdherence(
      [],
      [local("2026-07-01", 9), local("2026-07-01", 15)],
      TZ,
      "2026-07-01",
      "2026-07-02"
    );
    expect(r.expectedDoses).toBe(0);
    expect(r.takenDoses).toBe(2);
  });

  it("adesão perfeita numa semana de duas doses por dia", () => {
    const days = localDaysBetween("2026-07-01", "2026-07-07");
    const logs = days.flatMap((d) => [local(d, 8), local(d, 20)]);
    const r = computePeriodAdherence(["08:00", "20:00"], logs, TZ, "2026-07-01", "2026-07-07");
    expect(r.expectedDoses).toBe(14);
    expect(r.takenDoses).toBe(14);
    expect(r.unmatchedLogs).toBe(0);
  });
});
