import { describe, expect, it } from "vitest";
import { computeWeeklyExerciseProgress, getWeeklyExerciseTarget } from "./weekly-goals";

describe("weekly exercise goals", () => {
  it("returns a sensible target for each body goal", () => {
    expect(getWeeklyExerciseTarget("lose")).toMatchObject({ targetMinutes: 150, targetSessions: 3 });
    expect(getWeeklyExerciseTarget("gain")).toMatchObject({ targetMinutes: 180, targetSessions: 4 });
    expect(getWeeklyExerciseTarget("maintain")).toMatchObject({ targetMinutes: 120, targetSessions: 3 });
  });

  it("counts minutes and active days inside the current week", () => {
    const now = new Date("2026-07-16T09:00:00.000Z");

    const progress = computeWeeklyExerciseProgress(
      [
        { started_at: "2026-07-14T07:00:00.000Z", duration_min: 30, id: "1", user_id: "u", label: "Caminhada", calories_burned: null, intensity: null, notes: null, created_at: "2026-07-14T07:00:00.000Z" },
        { started_at: "2026-07-16T18:00:00.000Z", duration_min: 20, id: "2", user_id: "u", label: "Yoga", calories_burned: null, intensity: null, notes: null, created_at: "2026-07-16T18:00:00.000Z" },
        { started_at: "2026-07-12T19:00:00.000Z", duration_min: 40, id: "3", user_id: "u", label: "Treino antigo", calories_burned: null, intensity: null, notes: null, created_at: "2026-07-12T19:00:00.000Z" },
      ],
      now,
      "lose"
    );

    expect(progress.minutes).toBe(50);
    expect(progress.activeDays).toBe(2);
    expect(progress.progressPct).toBe(33);
    expect(progress.targetMinutes).toBe(150);
    expect(progress.targetSessions).toBe(3);
  });

  it("adjusts the workout suggestion when glucose is high", () => {
    const progress = computeWeeklyExerciseProgress([], new Date("2026-07-16T09:00:00.000Z"), "lose", {
      latestGlucose: 210,
      targetMin: 70,
      targetMax: 180,
    });

    expect(progress.workoutSuggestion).toContain("caminhada");
    expect(progress.workoutSuggestion).toContain("hidratação");
  });

  it("suggests a lighter session when glucose is below target", () => {
    const progress = computeWeeklyExerciseProgress([], new Date("2026-07-16T09:00:00.000Z"), "gain", {
      latestGlucose: 62,
      targetMin: 70,
      targetMax: 180,
    });

    expect(progress.workoutSuggestion).toContain("leve");
    expect(progress.workoutSuggestion).toContain("lanche");
  });

  it("keeps the goal-based suggestion when glucose is in range", () => {
    const progress = computeWeeklyExerciseProgress([], new Date("2026-07-16T09:00:00.000Z"), "gain", {
      latestGlucose: 110,
      targetMin: 70,
      targetMax: 180,
    });

    expect(progress.workoutSuggestion).toContain("força");
  });
});
