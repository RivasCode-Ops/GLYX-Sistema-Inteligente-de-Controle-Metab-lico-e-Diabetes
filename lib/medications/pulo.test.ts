import { describe, expect, it } from "vitest";
import { computeDoseStatus, doseWindows } from "./adherence";
import { doseDoPulo } from "./pulo";

// Correção de 31/10/2026: "Pulei hoje" marca a dose informada, não a do toque.

const AGORA = new Date("2026-10-30T18:00:00Z"); // 15:00 em São Paulo

describe("doseDoPulo", () => {
  it("aceita a dose de hoje cedo e recusa valores absurdos", () => {
    expect(doseDoPulo("2026-10-30T11:00:00.000Z", AGORA)?.toISOString()).toBe("2026-10-30T11:00:00.000Z");
    expect(doseDoPulo("2026-10-27T11:00:00.000Z", AGORA)).toBeNull();
    expect(doseDoPulo("2026-10-31T23:00:00.000Z", AGORA)).toBeNull();
    expect(doseDoPulo("não é data", AGORA)).toBeNull();
    expect(doseDoPulo(null, AGORA)).toBeNull();
  });

  it("pulo da dose das 08:00 registrado às 15:00 fica 'pulada' na dose das 08:00", () => {
    const [w08] = doseWindows(["08:00", "20:00"], 2026, 10, 30, "America/Sao_Paulo");
    const dose = doseDoPulo(w08.scheduledUTC.toISOString(), AGORA)!;
    // O registro leva o horário da dose (é o que a ação grava em taken_at).
    const status = computeDoseStatus(
      w08.scheduledUTC,
      w08.windowEndUTC,
      [{ taken_at: dose.toISOString(), confirmed: false }],
      [],
      new Set(),
      AGORA.getTime()
    );
    expect(status.state).toBe("pulada");
  });
});
