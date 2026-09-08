import { describe, expect, it } from "vitest";
import { resumirDosesDoDia, type MedicationLike } from "./day-summary";

const TZ = "America/Sao_Paulo";

/** 07/09/2026, hora local de São Paulo (UTC-3). */
const local = (h: number, m = 0) => Date.UTC(2026, 8, 7, h + 3, m);

const LANTUS: MedicationLike = {
  id: "lantus",
  name: "Insulina Lantus",
  dosage: "22 U",
  reminder_times: ["07:00", "22:00"],
};
const CREATINA: MedicationLike = { id: "cre", name: "Creatina", reminder_times: ["08:00"] };
/** Sem horário: não entra em dose do dia nenhuma. */
const WHEY: MedicationLike = { id: "whey", name: "Whey", reminder_times: [] };

describe("resumo das doses do dia", () => {
  it("conta uma dose por horário de cada item agendado", () => {
    const r = resumirDosesDoDia([LANTUS, CREATINA, WHEY], [], [], TZ, local(23));
    expect(r.total).toBe(3);
    expect(r.doses.map((d) => d.time)).toEqual(["07:00", "08:00", "22:00"]);
  });

  it("item sem horário não vira dose", () => {
    const r = resumirDosesDoDia([WHEY], [], [], TZ, local(12));
    expect(r.total).toBe(0);
    expect(r.proxima).toBeNull();
  });

  it("separa tomada, atrasada e ainda agendada", () => {
    // 09:00: a das 07:00 foi registrada, a das 08:00 venceu sem registro, a das
    // 22:00 ainda nem chegou.
    const logs = [{ medication_id: "lantus", taken_at: new Date(local(7, 5)).toISOString() }];
    const r = resumirDosesDoDia([LANTUS, CREATINA], logs, [], TZ, local(9));
    expect(r.tomadas).toBe(1);
    expect(r.atrasadas).toBe(1);
    expect(r.agendadas).toBe(1);
  });
});

describe("próxima dose", () => {
  it("é a mais cedo que ainda não foi registrada, mesmo que atrasada", () => {
    // Para quem usa, "próxima" é "a que eu ainda preciso tomar" — não a
    // próxima no relógio.
    const r = resumirDosesDoDia([LANTUS, CREATINA], [], [], TZ, local(9));
    expect(r.proxima?.time).toBe("07:00");
    expect(r.proxima?.state).toBe("pendente");
  });

  it("pula a que já foi registrada", () => {
    const logs = [{ medication_id: "lantus", taken_at: new Date(local(7, 5)).toISOString() }];
    const r = resumirDosesDoDia([LANTUS, CREATINA], logs, [], TZ, local(9));
    expect(r.proxima?.name).toBe("Creatina");
  });

  it("some quando tudo do dia foi registrado", () => {
    const logs = [
      { medication_id: "lantus", taken_at: new Date(local(7, 5)).toISOString() },
      { medication_id: "cre", taken_at: new Date(local(8, 5)).toISOString() },
      { medication_id: "lantus", taken_at: new Date(local(22, 5)).toISOString() },
    ];
    const r = resumirDosesDoDia([LANTUS, CREATINA], logs, [], TZ, local(23));
    expect(r.proxima).toBeNull();
    expect(r.tomadas).toBe(3);
  });
});

/**
 * O ponto mais fácil de errar da tela: mostrar 0% de manhã cedo.
 */
describe("adesão do dia", () => {
  it("é null antes de qualquer dose vencer — não zero", () => {
    // 06:00: nenhuma das doses (07:00, 08:00, 22:00) venceu ainda. Dizer
    // "0% de adesão" seria acusar por algo que não aconteceu.
    const r = resumirDosesDoDia([LANTUS, CREATINA], [], [], TZ, local(6));
    expect(r.adesaoPct).toBeNull();
    expect(r.agendadas).toBe(3);
  });

  it("conta só o que já venceu no denominador", () => {
    // 09:00: venceram 07:00 e 08:00. Uma registrada = 50%, não 33%.
    const logs = [{ medication_id: "lantus", taken_at: new Date(local(7, 5)).toISOString() }];
    const r = resumirDosesDoDia([LANTUS, CREATINA], logs, [], TZ, local(9));
    expect(r.adesaoPct).toBe(50);
  });

  it("chega a 100 quando tudo que venceu foi registrado", () => {
    const logs = [
      { medication_id: "lantus", taken_at: new Date(local(7, 5)).toISOString() },
      { medication_id: "cre", taken_at: new Date(local(8, 5)).toISOString() },
    ];
    const r = resumirDosesDoDia([LANTUS, CREATINA], logs, [], TZ, local(9));
    expect(r.adesaoPct).toBe(100);
    // E a dose das 22:00 continua agendada, sem entrar na conta.
    expect(r.agendadas).toBe(1);
  });
});

describe("adiamento", () => {
  it("dose adiada não conta como tomada nem como atrasada", () => {
    const snoozes = [
      {
        medication_id: "cre",
        snoozed_until: new Date(local(9, 30)).toISOString(),
        scheduled_for: new Date(local(8)).toISOString(),
      },
    ];
    const r = resumirDosesDoDia([CREATINA], [], snoozes, TZ, local(9));
    expect(r.doses[0].state).toBe("adiada");
    expect(r.tomadas).toBe(0);
    expect(r.atrasadas).toBe(0);
  });

  it("mas continua sendo a próxima, porque ainda precisa ser tomada", () => {
    const snoozes = [
      {
        medication_id: "cre",
        snoozed_until: new Date(local(9, 30)).toISOString(),
        scheduled_for: new Date(local(8)).toISOString(),
      },
    ];
    const r = resumirDosesDoDia([CREATINA], [], snoozes, TZ, local(9));
    expect(r.proxima?.state).toBe("adiada");
  });
});
