import { describe, expect, it } from "vitest";
import { buildBodyAlerts, findStagnantMeasures } from "./alerts";
import { computeWeeklyVolume } from "@/lib/exercicios/weekly-volume";
import { computeGoalProgress } from "./goals";
import { computeComposition } from "./composition";
import type { BodyMeasurement } from "./fields";

const NOW = new Date("2026-07-26T12:00:00Z");

const history: BodyMeasurement[] = [
  { measured_on: "2026-04-01", chest_cm: 110, waist_cm: 95, arm_right_flexed_cm: 32 },
  { measured_on: "2026-05-20", chest_cm: 110.2, waist_cm: 93, arm_right_flexed_cm: 32.5 },
  { measured_on: "2026-07-20", chest_cm: 110.4, waist_cm: 91, arm_right_flexed_cm: 33 },
];

describe("findStagnantMeasures", () => {
  it("acha medida parada dentro da margem de erro", () => {
    const stagnant = findStagnantMeasures(history, ["chest_cm"], 8, NOW);
    expect(stagnant).toHaveLength(1);
    expect(stagnant[0].key).toBe("chest_cm");
  });

  it("medida que evoluiu além do ruído não é estagnação", () => {
    expect(findStagnantMeasures(history, ["waist_cm"], 8, NOW)).toHaveLength(0);
  });

  it("sem medição antiga na janela não conclui nada", () => {
    const recente: BodyMeasurement[] = [
      { measured_on: "2026-07-10", chest_cm: 110 },
      { measured_on: "2026-07-20", chest_cm: 110.1 },
    ];
    expect(findStagnantMeasures(recente, ["chest_cm"], 8, NOW)).toHaveLength(0);
  });
});

describe("buildBodyAlerts", () => {
  const goalPeito = computeGoalProgress(
    { metric: "chest_cm", target_value: 114, start_value: 110, start_on: "2026-04-01", target_date: null },
    history
  )!;

  it("cruza meta de medida com volume de treino insuficiente", () => {
    const volume = computeWeeklyVolume([], 4, NOW);
    const alerts = buildBodyAlerts({
      progress: null,
      goals: [goalPeito],
      volume,
      history,
      latestComposition: null,
      latestMeasurement: history[history.length - 1],
      glucoseLoweringMeds: false,
      now: NOW,
    });
    expect(alerts.some((a) => a.id === "volume_goal_peito")).toBe(true);
  });

  it("sinaliza medida parada há semanas quando ela é meta de crescimento", () => {
    const alerts = buildBodyAlerts({
      progress: null,
      goals: [goalPeito],
      volume: computeWeeklyVolume([], 4, NOW),
      history,
      latestComposition: null,
      latestMeasurement: history[history.length - 1],
      glucoseLoweringMeds: false,
      now: NOW,
    });
    expect(alerts.some((a) => a.id === "stagnant_chest_cm")).toBe(true);
  });

  it("avisa risco cardiometabólico pela relação cintura/altura", () => {
    const composition = computeComposition({
      measurement: { measured_on: "2026-07-20", weight_kg: 95, waist_cm: 105, neck_cm: 42 },
      sex: "m",
      ageYears: 45,
      heightCm: 170,
    });
    const alerts = buildBodyAlerts({
      progress: null,
      goals: [],
      volume: computeWeeklyVolume([], 4, NOW),
      history,
      latestComposition: composition,
      latestMeasurement: history[history.length - 1],
      glucoseLoweringMeds: true,
      now: NOW,
    });
    const risk = alerts.find((a) => a.id === "waist_height_risk");
    expect(risk).toBeDefined();
    // Quem usa insulina/secretagogo não recebe sugestão de comer menos sem
    // a barreira do aval médico.
    expect(risk!.body).toContain("médico");
  });

  it("não inventa alerta sem dado nenhum", () => {
    const alerts = buildBodyAlerts({
      progress: null,
      goals: [],
      volume: computeWeeklyVolume([], 4, NOW),
      history: [],
      latestComposition: null,
      latestMeasurement: null,
      glucoseLoweringMeds: false,
      now: NOW,
    });
    expect(alerts).toEqual([]);
  });
});
