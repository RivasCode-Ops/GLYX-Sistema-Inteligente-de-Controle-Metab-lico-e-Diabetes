import { describe, expect, it } from "vitest";
import { buildDashboardBars, recoveryPercent } from "./dashboard";
import { computeGoalProgress } from "./goals";
import type { BodyMeasurement } from "./fields";
import type { ExerciseProgression } from "@/lib/exercicios/weekly-volume";

const NOW = new Date("2026-07-26T12:00:00Z");

const history: BodyMeasurement[] = [
  { measured_on: "2026-04-01", chest_cm: 110, waist_cm: 95 },
  { measured_on: "2026-07-20", chest_cm: 112, waist_cm: 91 },
];

const metaPeito = computeGoalProgress(
  { metric: "chest_cm", target_value: 114, start_value: 110, start_on: "2026-04-01", target_date: null },
  history
)!;
const metaCintura = computeGoalProgress(
  { metric: "waist_cm", target_value: 85, start_value: 95, start_on: "2026-04-01", target_date: null },
  history
)!;

function progression(over: Partial<ExerciseProgression>): ExerciseProgression {
  return {
    exercise: "supino",
    muscleGroup: "peito",
    firstOneRm: 80,
    lastOneRm: 85,
    deltaPercent: 6.3,
    sessions: 6,
    progressing: true,
    ...over,
  };
}

function bars(over: Parameters<typeof buildDashboardBars>[0]) {
  return new Map(buildDashboardBars(over).map((b) => [b.key, b]));
}

describe("recoveryPercent", () => {
  it("sem treino registrado devolve null, não 0", () => {
    // 0% seria lido como "você está destruído"; a verdade é "não sei".
    expect(recoveryPercent({}, NOW)).toBeNull();
  });

  it("grupo treinado agora derruba a média, mas não zera o painel", () => {
    const agora = NOW.toISOString();
    const pct = recoveryPercent({ peito: agora }, NOW)!;
    expect(pct).toBeGreaterThan(80);
    expect(pct).toBeLessThan(100);
  });

  it("treino antigo conta como recuperado", () => {
    const semanaPassada = new Date(NOW.getTime() - 7 * 86_400_000).toISOString();
    expect(recoveryPercent({ peito: semanaPassada }, NOW)).toBe(100);
  });
});

describe("buildDashboardBars", () => {
  const base = {
    goals: [],
    progressions: [],
    lastTrainedByGroup: {},
    weeklyMinutes: 0,
    weeklyTargetMinutes: 150,
    now: NOW,
  };

  it("sem meta nenhuma, as barras de corpo ficam sem dado e explicam o que falta", () => {
    const b = bars(base);
    expect(b.get("massa_muscular")!.percent).toBeNull();
    expect(b.get("massa_muscular")!.missing).toContain("metas");
    expect(b.get("perda_gordura")!.percent).toBeNull();
  });

  it("separa meta de músculo de meta de gordura", () => {
    const b = bars({ ...base, goals: [metaPeito, metaCintura] });
    // Peito: 110 → 112 de 110 → 114 = 50%
    expect(b.get("massa_muscular")!.percent).toBe(50);
    // Cintura: 95 → 91 de 95 → 85 = 40%
    expect(b.get("perda_gordura")!.percent).toBe(40);
  });

  it("hipertrofia é a fração de exercícios progredindo", () => {
    const b = bars({
      ...base,
      progressions: [
        progression({ exercise: "supino", progressing: true }),
        progression({ exercise: "remada", progressing: false }),
        progression({ exercise: "agachamento", progressing: true }),
        progression({ exercise: "rosca", progressing: false }),
      ],
    });
    expect(b.get("hipertrofia")!.percent).toBe(50);
  });

  it("adesão não passa de 100% em semana puxada", () => {
    const b = bars({ ...base, weeklyMinutes: 400, weeklyTargetMinutes: 150 });
    expect(b.get("adesao")!.percent).toBe(100);
  });

  it("meta semanal zerada não vira divisão por zero", () => {
    const b = bars({ ...base, weeklyMinutes: 30, weeklyTargetMinutes: 0 });
    expect(b.get("adesao")!.percent).toBeNull();
  });

  it("toda barra carrega a própria definição", () => {
    // Barra de progresso sem definição é a forma mais fácil de mentir com dado:
    // a régua muda de barra pra barra (meta, recuperação, carga, minutos).
    for (const bar of buildDashboardBars(base)) {
      expect(bar.definition.length).toBeGreaterThan(20);
    }
  });
});
