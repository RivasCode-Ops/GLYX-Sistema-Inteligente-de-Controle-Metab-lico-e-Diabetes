import { describe, expect, it } from "vitest";
import { computeMuscleRecovery, suggestMuscleFocus } from "./muscle-recovery";

const NOW = new Date("2026-07-13T12:00:00.000Z");

describe("computeMuscleRecovery", () => {
  it("marca como nunca treinado quando não há registro", () => {
    const result = computeMuscleRecovery({}, NOW);
    expect(result.every((r) => r.status === "never")).toBe(true);
  });

  it("marca como recuperando quando dentro da janela do grupo", () => {
    // pernas: janela de 72h, treinado há 10h
    const trainedAt = new Date(NOW.getTime() - 10 * 3_600_000).toISOString();
    const result = computeMuscleRecovery({ pernas: trainedAt }, NOW);
    const pernas = result.find((r) => r.id === "pernas")!;
    expect(pernas.status).toBe("recovering");
    expect(pernas.hoursRemaining).toBe(62);
  });

  it("marca como pronto quando a janela já passou", () => {
    // core: janela de 24h, treinado há 30h
    const trainedAt = new Date(NOW.getTime() - 30 * 3_600_000).toISOString();
    const result = computeMuscleRecovery({ core: trainedAt }, NOW);
    const core = result.find((r) => r.id === "core")!;
    expect(core.status).toBe("ready");
    expect(core.hoursReady).toBe(6);
  });

  it("respeita janelas diferentes por grupo (pernas 72h vs braços 24h)", () => {
    const trainedAt = new Date(NOW.getTime() - 30 * 3_600_000).toISOString();
    const result = computeMuscleRecovery({ pernas: trainedAt, bracos: trainedAt }, NOW);
    expect(result.find((r) => r.id === "pernas")!.status).toBe("recovering");
    expect(result.find((r) => r.id === "bracos")!.status).toBe("ready");
  });
});

describe("suggestMuscleFocus", () => {
  it("prioriza grupo nunca treinado sobre grupos prontos", () => {
    const statuses = computeMuscleRecovery(
      { peito: new Date(NOW.getTime() - 100 * 3_600_000).toISOString() },
      NOW
    );
    const suggestion = suggestMuscleFocus(statuses);
    expect(suggestion?.status).toBe("never");
  });

  it("sugere o grupo pronto há mais tempo quando todos já foram treinados", () => {
    const longAgo = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const recent = new Date(NOW.getTime() - 100 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(
      ["peito", "costas", "pernas", "ombros", "bracos", "core"].map((id) => [
        id,
        id === "pernas" ? longAgo : recent,
      ])
    );
    const statuses = computeMuscleRecovery(lastTrained, NOW);
    const suggestion = suggestMuscleFocus(statuses);
    expect(suggestion?.id).toBe("pernas");
  });

  it("retorna null quando tudo ainda está recuperando", () => {
    const justTrained = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(
      ["peito", "costas", "pernas", "ombros", "bracos", "core"].map((id) => [id, justTrained])
    );
    const statuses = computeMuscleRecovery(lastTrained, NOW);
    expect(suggestMuscleFocus(statuses)).toBeNull();
  });
});
