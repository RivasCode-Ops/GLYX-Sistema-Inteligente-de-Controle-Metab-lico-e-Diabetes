import { describe, expect, it } from "vitest";
import { computeMedicationDoseSummary } from "./daily-doses-card";
import type { Medication } from "@/types/database";

const TZ = "America/Sao_Paulo";

function med(reminderTimes: string[]): Medication {
  return {
    id: "med-1",
    user_id: "user-1",
    name: "Rosuvastatina Cálcica 20 mg",
    dosage: "1 comprimido",
    schedule_hint: null,
    active: true,
    notes: null,
    reminder_times: reminderTimes,
    kind: "med",
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("computeMedicationDoseSummary", () => {
  it("conta como tomada uma dose registrada bem depois do horário (última do dia)", () => {
    // Agendada 19:00 local, registrada 23:54 local — mais de 4h depois,
    // sem próxima dose no dia. Antes da correção, isso nunca casava e a
    // dose ficava "pendente" pra sempre (usuário clicava várias vezes achando
    // que não estava registrando).
    const now = new Date("2026-07-20T02:55:00.000Z").getTime(); // 23:55 local, mesmo dia do registro
    const summary = computeMedicationDoseSummary(
      med(["19:00"]),
      [{ medication_id: "med-1", taken_at: "2026-07-20T02:54:02.036Z" }], // 23:54 local
      [],
      TZ,
      now
    );
    expect(summary.taken).toBe(1);
    expect(summary.lastAt).toBe("2026-07-20T02:54:02.036Z");
  });

  it("não deixa uma dose tardia \"vazar\" pra próxima dose do mesmo remédio", () => {
    // 07:00 e 12:00 no mesmo dia; registro às 11:50 deve casar com a dose
    // das 07:00 (ainda dentro da janela até o próximo horário), não criar
    // uma segunda dose "tomada" fantasma para o horário das 12:00.
    const now = new Date("2026-07-20T15:00:00Z").getTime(); // 12:00 local
    const summary = computeMedicationDoseSummary(
      med(["07:00", "12:00"]),
      [{ medication_id: "med-1", taken_at: "2026-07-20T14:50:00.000Z" }], // 11:50 local
      [],
      TZ,
      now
    );
    expect(summary.taken).toBe(1);
  });
});
