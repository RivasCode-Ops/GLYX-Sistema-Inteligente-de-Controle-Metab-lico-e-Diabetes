import { describe, expect, it } from "vitest";
import { computeMuscleRecovery, suggestMuscleFocus, suggestMuscleSplit } from "./muscle-recovery";

const NOW = new Date("2026-07-13T12:00:00.000Z");
const ALL_IDS = [
  "peito",
  "costas",
  "pernas",
  "ombros",
  "biceps",
  "triceps",
  "abdomen",
  "panturrilhas",
  "antebracos",
];

describe("computeMuscleRecovery", () => {
  it("marca como nunca treinado quando não há registro", () => {
    const result = computeMuscleRecovery({}, {}, NOW);
    expect(result.every((r) => r.status === "never")).toBe(true);
  });

  it("marca como recuperando quando dentro da janela do grupo", () => {
    // pernas: janela de 72h, treinado há 10h
    const trainedAt = new Date(NOW.getTime() - 10 * 3_600_000).toISOString();
    const result = computeMuscleRecovery({ pernas: trainedAt }, {}, NOW);
    const pernas = result.find((r) => r.id === "pernas")!;
    expect(pernas.status).toBe("recovering");
    expect(pernas.hoursRemaining).toBe(62);
  });

  it("marca como pronto quando a janela já passou", () => {
    // abdomen: janela de 24h, treinado há 30h
    const trainedAt = new Date(NOW.getTime() - 30 * 3_600_000).toISOString();
    const result = computeMuscleRecovery({ abdomen: trainedAt }, {}, NOW);
    const abdomen = result.find((r) => r.id === "abdomen")!;
    expect(abdomen.status).toBe("ready");
    expect(abdomen.hoursReady).toBe(6);
  });

  it("respeita janelas diferentes por grupo (pernas 72h vs abdômen 24h)", () => {
    const trainedAt = new Date(NOW.getTime() - 30 * 3_600_000).toISOString();
    const result = computeMuscleRecovery({ pernas: trainedAt, abdomen: trainedAt }, {}, NOW);
    expect(result.find((r) => r.id === "pernas")!.status).toBe("recovering");
    expect(result.find((r) => r.id === "abdomen")!.status).toBe("ready");
  });

  it("pausa manual vence o cronômetro, mesmo pronto ou nunca treinado", () => {
    const longReady = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const result = computeMuscleRecovery(
      { peito: longReady },
      { peito: "dor no ombro", pernas: null },
      NOW
    );
    const peito = result.find((r) => r.id === "peito")!;
    const pernas = result.find((r) => r.id === "pernas")!;
    expect(peito.status).toBe("paused");
    expect(peito.pauseReason).toBe("dor no ombro");
    expect(pernas.status).toBe("paused");
    expect(pernas.pauseReason).toBeNull();
  });
});

describe("suggestMuscleFocus", () => {
  it("prioriza grupo nunca treinado sobre grupos prontos", () => {
    const statuses = computeMuscleRecovery(
      { peito: new Date(NOW.getTime() - 100 * 3_600_000).toISOString() },
      {},
      NOW
    );
    const suggestion = suggestMuscleFocus(statuses);
    expect(suggestion?.status).toBe("never");
  });

  it("sugere o grupo pronto há mais tempo quando todos já foram treinados", () => {
    const longAgo = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const recent = new Date(NOW.getTime() - 100 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(
      ALL_IDS.map((id) => [id, id === "pernas" ? longAgo : recent])
    );
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    const suggestion = suggestMuscleFocus(statuses);
    expect(suggestion?.id).toBe("pernas");
  });

  it("retorna null quando tudo ainda está recuperando", () => {
    const justTrained = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(ALL_IDS.map((id) => [id, justTrained]));
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    expect(suggestMuscleFocus(statuses)).toBeNull();
  });

  it("nunca sugere um grupo pausado", () => {
    // pernas seria a única pronta (e a mais atrasada) se não estivesse pausada;
    // as demais estão recuperando (não "nunca treinado"), então não há candidato.
    const longAgo = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const justTrained = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(
      ALL_IDS.map((id) => [id, id === "pernas" ? longAgo : justTrained])
    );
    const statuses = computeMuscleRecovery(lastTrained, { pernas: "dor" }, NOW);
    expect(suggestMuscleFocus(statuses)).toBeNull();
  });
});

describe("suggestMuscleSplit", () => {
  it("sugere o dia (push/pull/pernas) com músculos mais atrasados", () => {
    // pull inteiro (costas, bíceps, antebraços) pronto há muito mais tempo que o resto
    const longAgo = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const recent = new Date(NOW.getTime() - 100 * 3_600_000).toISOString();
    const pullIds = ["costas", "biceps", "antebracos"];
    const lastTrained = Object.fromEntries(
      ALL_IDS.map((id) => [id, pullIds.includes(id) ? longAgo : recent])
    );
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    const suggestion = suggestMuscleSplit(statuses);
    expect(suggestion?.split.id).toBe("pull");
    expect(suggestion?.available.map((s) => s.id).sort()).toEqual(pullIds.sort());
    expect(suggestion?.resting).toHaveLength(0);
  });

  it("mostra no mínimo 1 músculo disponível quando só um do dia está pronto", () => {
    const longAgo = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const justTrained = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    // só peito (push) está pronto; todo o resto, incluindo ombros/tríceps do mesmo dia, recuperando
    const lastTrained = Object.fromEntries(
      ALL_IDS.map((id) => [id, id === "peito" ? longAgo : justTrained])
    );
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    const suggestion = suggestMuscleSplit(statuses);
    expect(suggestion?.split.id).toBe("push");
    expect(suggestion?.available.map((s) => s.id)).toEqual(["peito"]);
    expect(suggestion?.resting.map((s) => s.id).sort()).toEqual(["ombros", "triceps"]);
  });

  it("retorna null quando nenhum dia tem músculo disponível", () => {
    const justTrained = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(ALL_IDS.map((id) => [id, justTrained]));
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    expect(suggestMuscleSplit(statuses)).toBeNull();
  });
});
