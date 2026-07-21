import { describe, expect, it } from "vitest";
import {
  computeMuscleRecovery,
  limitAvailableByTime,
  suggestMuscleFocus,
  suggestMuscleSplit,
} from "./muscle-recovery";

const NOW = new Date("2026-07-13T12:00:00.000Z");
const ALL_IDS = [
  "peito",
  "costas",
  "quadriceps",
  "posterior",
  "ombros",
  "biceps",
  "triceps",
  "abdomen",
  "panturrilhas",
  "antebracos",
];

describe("computeMuscleRecovery", () => {
  it("marca como nunca treinado quando nÃ£o hÃ¡ registro", () => {
    const result = computeMuscleRecovery({}, {}, NOW);
    expect(result.every((r) => r.status === "never")).toBe(true);
  });

  it("marca como recuperando quando dentro da janela do grupo", () => {
    // quadriceps: janela de 72h, treinado hÃ¡ 10h
    const trainedAt = new Date(NOW.getTime() - 10 * 3_600_000).toISOString();
    const result = computeMuscleRecovery({ quadriceps: trainedAt }, {}, NOW);
    const quadriceps = result.find((r) => r.id === "quadriceps")!;
    expect(quadriceps.status).toBe("recovering");
    expect(quadriceps.hoursRemaining).toBe(62);
  });

  it("marca como pronto quando a janela jÃ¡ passou", () => {
    // abdomen: janela de 24h, treinado hÃ¡ 30h
    const trainedAt = new Date(NOW.getTime() - 30 * 3_600_000).toISOString();
    const result = computeMuscleRecovery({ abdomen: trainedAt }, {}, NOW);
    const abdomen = result.find((r) => r.id === "abdomen")!;
    expect(abdomen.status).toBe("ready");
    expect(abdomen.hoursReady).toBe(6);
  });

  it("respeita janelas diferentes por grupo (pernas 72h vs abdÃ´men 24h)", () => {
    const trainedAt = new Date(NOW.getTime() - 30 * 3_600_000).toISOString();
    const result = computeMuscleRecovery({ quadriceps: trainedAt, abdomen: trainedAt }, {}, NOW);
    expect(result.find((r) => r.id === "quadriceps")!.status).toBe("recovering");
    expect(result.find((r) => r.id === "abdomen")!.status).toBe("ready");
  });

  it("pausa manual vence o cronÃ´metro, mesmo pronto ou nunca treinado", () => {
    const longReady = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const result = computeMuscleRecovery(
      { peito: longReady },
      { peito: "dor no ombro", quadriceps: null },
      NOW
    );
    const peito = result.find((r) => r.id === "peito")!;
    const quadriceps = result.find((r) => r.id === "quadriceps")!;
    expect(peito.status).toBe("paused");
    expect(peito.pauseReason).toBe("dor no ombro");
    expect(quadriceps.status).toBe("paused");
    expect(quadriceps.pauseReason).toBeNull();
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

  it("sugere o grupo pronto hÃ¡ mais tempo quando todos jÃ¡ foram treinados", () => {
    const longAgo = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const recent = new Date(NOW.getTime() - 100 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(
      ALL_IDS.map((id) => [id, id === "quadriceps" ? longAgo : recent])
    );
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    const suggestion = suggestMuscleFocus(statuses);
    expect(suggestion?.id).toBe("quadriceps");
  });

  it("retorna null quando tudo ainda estÃ¡ recuperando", () => {
    const justTrained = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(ALL_IDS.map((id) => [id, justTrained]));
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    expect(suggestMuscleFocus(statuses)).toBeNull();
  });

  it("nunca sugere um grupo pausado", () => {
    // pernas seria a Ãºnica pronta (e a mais atrasada) se nÃ£o estivesse pausada;
    // as demais estÃ£o recuperando (nÃ£o "nunca treinado"), entÃ£o nÃ£o hÃ¡ candidato.
    const longAgo = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const justTrained = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(
      ALL_IDS.map((id) => [id, id === "quadriceps" ? longAgo : justTrained])
    );
    const statuses = computeMuscleRecovery(lastTrained, { quadriceps: "dor" }, NOW);
    expect(suggestMuscleFocus(statuses)).toBeNull();
  });
});

describe("suggestMuscleSplit", () => {
  it("sugere o dia (push/pull/pernas) com mÃºsculos mais atrasados", () => {
    // pull inteiro (costas, bÃ­ceps, antebraÃ§os) pronto hÃ¡ muito mais tempo que o resto
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

  it("mostra no mÃ­nimo 1 mÃºsculo disponÃ­vel quando sÃ³ um do dia estÃ¡ pronto", () => {
    const longAgo = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const justTrained = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    // sÃ³ peito (push) estÃ¡ pronto; todo o resto, incluindo ombros/trÃ­ceps do mesmo dia, recuperando
    const lastTrained = Object.fromEntries(
      ALL_IDS.map((id) => [id, id === "peito" ? longAgo : justTrained])
    );
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    const suggestion = suggestMuscleSplit(statuses);
    expect(suggestion?.split.id).toBe("push");
    expect(suggestion?.available.map((s) => s.id)).toEqual(["peito"]);
    expect(suggestion?.resting.map((s) => s.id).sort()).toEqual(["ombros", "triceps"]);
  });

  it("retorna null quando nenhum dia tem mÃºsculo disponÃ­vel", () => {
    const justTrained = new Date(NOW.getTime() - 1 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(ALL_IDS.map((id) => [id, justTrained]));
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    expect(suggestMuscleSplit(statuses)).toBeNull();
  });

  it("ordena available do mais atrasado pro menos atrasado (nunca-treinado primeiro)", () => {
    // pull: costas nunca treinado, bÃ­ceps pronto hÃ¡ muito, antebraÃ§os pronto hÃ¡ pouco
    // (janela de bÃ­ceps e antebraÃ§os Ã© 36h â€” precisa passar disso pra virar "ready")
    const longAgo = new Date(NOW.getTime() - 200 * 3_600_000).toISOString();
    const recentReady = new Date(NOW.getTime() - 40 * 3_600_000).toISOString();
    const lastTrained = Object.fromEntries(
      ALL_IDS.filter((id) => id !== "costas").map((id) => [
        id,
        id === "biceps" ? longAgo : id === "antebracos" ? recentReady : new Date(NOW.getTime() - 1 * 3_600_000).toISOString(),
      ])
    );
    const statuses = computeMuscleRecovery(lastTrained, {}, NOW);
    const suggestion = suggestMuscleSplit(statuses);
    expect(suggestion?.split.id).toBe("pull");
    expect(suggestion?.available.map((s) => s.id)).toEqual(["costas", "biceps", "antebracos"]);
  });
});

describe("limitAvailableByTime", () => {
  const three = ["a", "b", "c"].map((id) => ({
    id: id as never,
    label: id,
    lastTrainedAt: null,
    status: "ready" as const,
    hoursRemaining: null,
    hoursReady: 0,
    pauseReason: null,
  }));

  it("30 min: sÃ³ o primeiro (mais prioritÃ¡rio) entra", () => {
    const { included, deferred } = limitAvailableByTime(three, 30);
    expect(included.map((s) => s.id)).toEqual(["a"]);
    expect(deferred.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("60 min: os dois primeiros entram", () => {
    const { included, deferred } = limitAvailableByTime(three, 60);
    expect(included.map((s) => s.id)).toEqual(["a", "b"]);
    expect(deferred.map((s) => s.id)).toEqual(["c"]);
  });

  it("90 min: todos entram, nada fica pra depois", () => {
    const { included, deferred } = limitAvailableByTime(three, 90);
    expect(included).toHaveLength(3);
    expect(deferred).toHaveLength(0);
  });
});

