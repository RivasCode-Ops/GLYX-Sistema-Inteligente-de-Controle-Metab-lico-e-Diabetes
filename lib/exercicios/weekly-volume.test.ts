import { describe, expect, it } from "vitest";
import {
  computeProgression,
  computeWeeklyVolume,
  estimatedOneRepMax,
  progressionRate,
  type StrengthLogRow,
} from "./weekly-volume";

const NOW = new Date("2026-07-26T12:00:00Z");

function log(over: Partial<StrengthLogRow> & { daysAgo: number }): StrengthLogRow {
  const { daysAgo, ...rest } = over;
  return {
    exercise_name: "supino",
    muscle_group: "peito",
    weight_kg: 60,
    reps: 10,
    sets: 3,
    logged_at: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    ...rest,
  };
}

describe("computeWeeklyVolume", () => {
  it("divide o total pela janela e classifica pela referência", () => {
    const logs = [
      log({ daysAgo: 2, sets: 4 }),
      log({ daysAgo: 9, sets: 4 }),
      log({ daysAgo: 16, sets: 4 }),
      log({ daysAgo: 23, sets: 4 }),
    ];
    const peito = computeWeeklyVolume(logs, 4, NOW).find((v) => v.id === "peito")!;
    expect(peito.totalSets).toBe(16);
    expect(peito.setsPerWeek).toBe(4);
    expect(peito.status).toBe("insuficiente");
  });

  it("grupo sem registro entra com zero em vez de sumir", () => {
    const costas = computeWeeklyVolume([log({ daysAgo: 2 })], 4, NOW).find((v) => v.id === "costas")!;
    expect(costas.setsPerWeek).toBe(0);
    expect(costas.status).toBe("sem_registro");
  });

  it("ignora registro fora da janela", () => {
    const peito = computeWeeklyVolume([log({ daysAgo: 60, sets: 20 })], 4, NOW).find(
      (v) => v.id === "peito"
    )!;
    expect(peito.totalSets).toBe(0);
  });

  it("volume muito acima da referência é sinalizado", () => {
    // 10 treinos × 12 séries em 4 semanas = 30 séries/semana, quase o dobro do
    // alvo ótimo de peito (16).
    const logs = Array.from({ length: 10 }, (_, i) => log({ daysAgo: i * 2, sets: 12 }));
    const peito = computeWeeklyVolume(logs, 4, NOW).find((v) => v.id === "peito")!;
    expect(peito.status).toBe("alto");
  });

  it('grupo legado "pernas" conta para quadríceps e posterior', () => {
    const volume = computeWeeklyVolume(
      [log({ daysAgo: 2, muscle_group: "pernas", sets: 12 })],
      4,
      NOW
    );
    expect(volume.find((v) => v.id === "quadriceps")!.totalSets).toBe(12);
    expect(volume.find((v) => v.id === "posterior")!.totalSets).toBe(12);
  });
});

describe("estimatedOneRepMax", () => {
  it("aplica Epley", () => {
    expect(estimatedOneRepMax(60, 10)).toBe(80);
  });
  it("recusa entrada inválida", () => {
    expect(estimatedOneRepMax(0, 10)).toBeNull();
    expect(estimatedOneRepMax(60, 0)).toBeNull();
  });
});

describe("computeProgression", () => {
  it("compara a melhor carga das duas metades da janela", () => {
    const logs = [
      log({ daysAgo: 50, weight_kg: 60 }),
      log({ daysAgo: 45, weight_kg: 60 }),
      log({ daysAgo: 10, weight_kg: 70 }),
      log({ daysAgo: 3, weight_kg: 72.5 }),
    ];
    const [p] = computeProgression(logs, 8, NOW);
    expect(p.exercise).toBe("supino");
    expect(p.firstOneRm).toBe(80);
    expect(p.lastOneRm).toBe(96.7);
    expect(p.progressing).toBe(true);
  });

  it("um dia ruim no fim não apaga a progressão da metade", () => {
    const logs = [
      log({ daysAgo: 50, weight_kg: 60 }),
      log({ daysAgo: 10, weight_kg: 75 }),
      log({ daysAgo: 1, weight_kg: 50 }),
    ];
    const [p] = computeProgression(logs, 8, NOW);
    expect(p.progressing).toBe(true);
  });

  it("exercício sem carga registrada fica de fora", () => {
    expect(computeProgression([log({ daysAgo: 5, weight_kg: null })], 8, NOW)).toEqual([]);
  });

  it("taxa de progressão é null sem exercícios", () => {
    expect(progressionRate([])).toBeNull();
  });
});
