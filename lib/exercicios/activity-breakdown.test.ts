import { describe, expect, it } from "vitest";
import type { ExerciseSession } from "@/types/database";
import { computeWeeklyExerciseProgress, sessionKind, summarizeByKind } from "./weekly-goals";

function session(over: Partial<ExerciseSession>): ExerciseSession {
  return {
    id: "x",
    user_id: "u",
    label: "Sessão",
    duration_min: null,
    calories_burned: null,
    intensity: null,
    started_at: "2026-07-14T07:00:00.000Z",
    notes: null,
    created_at: "2026-07-14T07:00:00.000Z",
    ...over,
  };
}

describe("classificação de atividade", () => {
  it("usa o tipo estruturado quando presente", () => {
    expect(sessionKind(session({ activity_type: "bicicleta" }))).toBe("cardio");
    expect(sessionKind(session({ activity_type: "corrida" }))).toBe("cardio");
    expect(sessionKind(session({ activity_type: "forca" }))).toBe("forca");
  });

  it("trata sessão com grupos musculares e sem tipo como força", () => {
    expect(sessionKind(session({ muscle_groups: ["biceps"] }))).toBe("forca");
  });

  it("cai em 'outro' sem tipo nem grupos", () => {
    expect(sessionKind(session({}))).toBe("outro");
  });
});

describe("resumo semanal por tipo", () => {
  it("soma minutos e sessões por tipo, ordenado por minutos", () => {
    const breakdown = summarizeByKind([
      session({ activity_type: "bicicleta", duration_min: 15 }),
      session({ activity_type: "corrida", duration_min: 30 }),
      session({ activity_type: "forca", duration_min: 40 }),
    ]);

    expect(breakdown).toEqual([
      { kind: "cardio", minutes: 45, sessions: 2 },
      { kind: "forca", minutes: 40, sessions: 1 },
    ]);
  });

  it("expõe a quebra no progresso semanal", () => {
    const now = new Date("2026-07-16T09:00:00.000Z");
    const progress = computeWeeklyExerciseProgress(
      [
        session({ activity_type: "bicicleta", duration_min: 15, started_at: "2026-07-14T07:00:00.000Z" }),
        session({ activity_type: "forca", duration_min: 40, started_at: "2026-07-15T07:00:00.000Z" }),
      ],
      now,
      "gain"
    );

    expect(progress.minutes).toBe(55);
    expect(progress.breakdown).toContainEqual({ kind: "cardio", minutes: 15, sessions: 1 });
    expect(progress.breakdown).toContainEqual({ kind: "forca", minutes: 40, sessions: 1 });
  });
});
