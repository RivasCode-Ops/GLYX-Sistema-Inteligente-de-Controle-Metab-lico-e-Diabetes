import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeDoseStatus, computePeriodAdherence, doseWindows } from "./adherence";
import { resumirDosesDoDia } from "./day-summary";
import { contarTomadas } from "./tomadas";
import { computeMedicationDoseSummary } from "@/components/medicacao/daily-doses-card";
import { groupMedicationLogsByDay } from "@/lib/reports/full-history";
import type { Medication } from "@/types/database";

// D16: "Pulei hoje" NÃO é dose tomada. Dados sintéticos; um item com doses às
// 08:00 e 20:00, em 14/10/2026 (São Paulo, UTC-3).
const TZ = "America/Sao_Paulo";
const SP = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 14, h + 3, m)).toISOString();
const MED = "med-sintetico";
const tomou = (h: number, m = 0, extra: Record<string, unknown> = {}) => ({ medication_id: MED, taken_at: SP(h, m), confirmed: true, ...extra });
const pulou = (h: number, m = 0) => ({ medication_id: MED, taken_at: SP(h, m), confirmed: false });
const adesao = (logs: { taken_at: string; confirmed?: boolean | null }[]) =>
  computePeriodAdherence(["08:00", "20:00"], logs, TZ, "2026-10-14", "2026-10-14");

describe("estado de cada dose", () => {
  const [oito] = doseWindows(["08:00", "20:00"], 2026, 10, 14, TZ);
  const estado = (logs: { taken_at: string; confirmed?: boolean | null }[]) =>
    computeDoseStatus(oito.scheduledUTC, oito.windowEndUTC, logs, [], new Set(), Date.parse(SP(23))).state;

  it("tomada", () => expect(estado([tomou(8, 5)])).toBe("tomada"));
  it("pulada — antes de 16/10 isto aparecia como TOMADA", () => expect(estado([pulou(8, 5)])).toBe("pulada"));
  it("pulou e depois tomou: tomada", () => expect(estado([pulou(8, 5), tomou(9)])).toBe("tomada"));
  it("sem registro e já vencida: pendente", () => expect(estado([])).toBe("pendente"));
  it("linha antiga lida sem a coluna `confirmed`: tomada, como antes", () =>
    expect(estado([{ taken_at: SP(8, 5) }])).toBe("tomada"));
});

describe("adesão do período (relatório médico)", () => {
  it("1 tomada + 1 pulada: 1 de 2 tomadas, 1 pulada, nada a mais", () => {
    expect(adesao([tomou(8, 5), pulou(20, 5)])).toEqual({ expectedDoses: 2, takenDoses: 1, unmatchedLogs: 0, skippedDoses: 1 });
  });
  it("as duas puladas: 0 de 2 tomadas — antes contava 2 de 2", () => {
    expect(adesao([pulou(8, 5), pulou(20, 5)])).toEqual({ expectedDoses: 2, takenDoses: 0, unmatchedLogs: 0, skippedDoses: 2 });
  });
  it("tomada + adicional + pulada: adicional é a mais, pulada à parte", () => {
    expect(adesao([tomou(8, 5), tomou(13, 0, { adherence_status: "adicional" }), pulou(20, 5)])).toEqual({
      expectedDoses: 2,
      takenDoses: 1,
      unmatchedLogs: 1,
      skippedDoses: 1,
    });
  });
  it("correção (uma linha, horário corrigido): conta pelo horário corrigido", () => {
    expect(adesao([tomou(9, 30, { correcoes: [{ taken_at_anterior: SP(8) }] }), tomou(20, 5)])).toEqual({
      expectedDoses: 2,
      takenDoses: 2,
      unmatchedLogs: 0,
      skippedDoses: 0,
    });
  });
  it("item sem horário: pulada não vira tomada", () => {
    expect(computePeriodAdherence([], [tomou(8), pulou(13)], TZ, "2026-10-14", "2026-10-14")).toEqual({
      expectedDoses: 0,
      takenDoses: 1,
      unmatchedLogs: 0,
      skippedDoses: 1,
    });
  });
});

describe("Doses de hoje", () => {
  const meds = [{ id: MED, name: "Remédio sintético", reminder_times: ["08:00", "20:00"], cadence: "diaria" }];
  const agora = Date.parse(SP(21));

  it("separa tomada, pulada e pendente; adesão = tomadas ÷ vencidas", () => {
    const r = resumirDosesDoDia(meds, [tomou(8, 5)], [], TZ, agora);
    expect([r.tomadas, r.puladas, r.atrasadas, r.adesaoPct]).toEqual([1, 0, 1, 50]);
    const r2 = resumirDosesDoDia(meds, [tomou(8, 5), pulou(20, 10)], [], TZ, agora);
    expect([r2.tomadas, r2.puladas, r2.atrasadas, r2.adesaoPct]).toEqual([1, 1, 0, 50]);
  });
  it("dose pulada não é 'a próxima a tomar'", () => {
    const r = resumirDosesDoDia(meds, [pulou(8, 5)], [], TZ, Date.parse(SP(10)));
    expect(r.proxima?.time).toBe("20:00");
  });
  it("contador por remédio da tela de medicamentos não conta pulada", () => {
    const med = { id: MED, name: "x", reminder_times: ["08:00", "20:00"], cadence: "diaria" } as unknown as Medication;
    expect(computeMedicationDoseSummary(med, [tomou(8, 5), pulou(20, 5)], [], TZ, agora).taken).toBe(1);
    const semHorario = { id: MED, name: "x", reminder_times: [] } as unknown as Medication;
    expect(computeMedicationDoseSummary(semHorario, [tomou(8), pulou(13)], [], TZ, agora).taken).toBe(1);
  });
});

describe("histórico completo", () => {
  it("lista tudo marcado e conta só tomadas", () => {
    const logs = [tomou(8, 5), tomou(8, 5), tomou(13, 0, { adherence_status: "adicional" }), pulou(20, 5)];
    const [dia] = groupMedicationLogsByDay(logs, new Map([[MED, "Remédio sintético"]]), TZ);
    expect(dia.entries.map((e) => e.marca)).toEqual([null, "tomada adicional", "pulada"]);
    expect(contarTomadas(logs)).toBe(2);
  });

  it("horário corrigido aparece marcado", () => {
    const logs = [tomou(8, 25, { correcoes: [{ taken_at: SP(8, 10) }] })];
    const [dia] = groupMedicationLogsByDay(logs, new Map([[MED, "Remédio sintético"]]), TZ);
    expect(dia.entries.map((e) => e.marca)).toEqual(["horário corrigido"]);
  });

  // Achado no navegador (15/10, P48 fechada): o relatório listava 08:25 sem a marca
  // porque a consulta não trazia `correcoes`. Pedir a coluna pelo nome derrubaria o
  // relatório inteiro num banco antes da migration (42703) — por isso `*`, como na
  // tela de medicação.
  it("a consulta do relatório traz as colunas da correção sem nomeá-las", () => {
    const fonte = readFileSync(join(process.cwd(), "lib", "reports", "full-history.ts"), "utf8");
    const m = fonte.match(/fetchAll<MedicationLogRow>\(\s*supabase,\s*"medication_logs",\s*"([^"]*)"/);
    expect(m?.[1]).toBe("*");
  });
});
