import { describe, expect, it } from "vitest";
import { computeGoalProgress, observedRatePerWeek, projectionMessage } from "./goals";
import type { BodyMeasurement } from "./fields";

const history: BodyMeasurement[] = [
  { measured_on: "2026-04-01", arm_right_flexed_cm: 32, waist_cm: 95 },
  { measured_on: "2026-05-01", arm_right_flexed_cm: 32.5, waist_cm: 93 },
  { measured_on: "2026-06-01", arm_right_flexed_cm: 33, waist_cm: 91 },
];

describe("observedRatePerWeek", () => {
  it("mede o ritmo na direção da meta", () => {
    const up = observedRatePerWeek(history, "arm_right_flexed_cm", "increase");
    expect(up).toBeGreaterThan(0);
    // Cintura caindo é progresso quando a meta é reduzir.
    const down = observedRatePerWeek(history, "waist_cm", "decrease");
    expect(down).toBeGreaterThan(0);
    // A mesma queda é ritmo negativo se a meta fosse aumentar.
    expect(observedRatePerWeek(history, "waist_cm", "increase")!).toBeLessThan(0);
  });

  it("mudança total dentro do erro de medição não vira ritmo", () => {
    // 0,5 cm em três meses é ruído de fita, não crescimento — dividir isso pelo
    // tempo produziria um ritmo pequeno e convincente, e dele sairia uma data.
    const ruido: BodyMeasurement[] = [
      { measured_on: "2026-04-01", arm_right_flexed_cm: 32 },
      { measured_on: "2026-07-01", arm_right_flexed_cm: 32.5 },
    ];
    expect(observedRatePerWeek(ruido, "arm_right_flexed_cm", "increase")).toBeNull();
  });

  it("exige janela mínima — duas medições em uma semana não estimam ritmo", () => {
    const curto: BodyMeasurement[] = [
      { measured_on: "2026-06-01", waist_cm: 95 },
      { measured_on: "2026-06-05", waist_cm: 94 },
    ];
    expect(observedRatePerWeek(curto, "waist_cm", "decrease")).toBeNull();
  });
});

describe("computeGoalProgress", () => {
  it("calcula progresso contra o ponto de partida congelado", () => {
    const g = computeGoalProgress(
      {
        metric: "arm_right_flexed_cm",
        target_value: 34,
        start_value: 32,
        start_on: "2026-04-01",
        target_date: null,
      },
      history
    )!;
    expect(g.direction).toBe("increase");
    expect(g.start).toBe(32);
    expect(g.current).toBe(33);
    expect(g.progressPercent).toBe(50);
    expect(g.remaining).toBe(1);
    expect(g.achieved).toBe(false);
  });

  it("meta de redução inverte a direção", () => {
    const g = computeGoalProgress(
      { metric: "waist_cm", target_value: 85, start_value: 95, start_on: "2026-04-01", target_date: null },
      history
    )!;
    expect(g.direction).toBe("decrease");
    expect(g.progressPercent).toBe(40);
    expect(g.remaining).toBe(6);
  });

  it("meta batida com folga não passa de 100%", () => {
    const g = computeGoalProgress(
      { metric: "waist_cm", target_value: 92, start_value: 95, start_on: "2026-04-01", target_date: null },
      history
    )!;
    expect(g.achieved).toBe(true);
    expect(g.progressPercent).toBe(100);
    expect(g.remaining).toBe(0);
  });

  it("projeta prazo no ritmo observado", () => {
    const g = computeGoalProgress(
      {
        metric: "arm_right_flexed_cm",
        target_value: 34,
        start_value: 32,
        start_on: "2026-04-01",
        target_date: null,
      },
      history
    )!;
    expect(g.weeksToTarget).not.toBeNull();
    expect(g.etaDate).not.toBeNull();
    expect(projectionMessage(g)).toContain("semanas");
  });

  it("ritmo na direção oposta não vira previsão", () => {
    const piorando: BodyMeasurement[] = [
      { measured_on: "2026-04-01", waist_cm: 91 },
      { measured_on: "2026-06-01", waist_cm: 95 },
    ];
    const g = computeGoalProgress(
      { metric: "waist_cm", target_value: 85, start_value: 91, start_on: "2026-04-01", target_date: null },
      piorando
    )!;
    expect(g.ratePerWeek!).toBeLessThan(0);
    expect(g.weeksToTarget).toBeNull();
    expect(projectionMessage(g)).toContain("direção oposta");
  });

  it("compara a projeção com a data-alvo", () => {
    const g = computeGoalProgress(
      {
        metric: "arm_right_flexed_cm",
        target_value: 34,
        start_value: 32,
        start_on: "2026-04-01",
        target_date: "2026-06-15",
      },
      history
    )!;
    expect(g.onTrack).toBe(false);
  });

  it("métrica desconhecida não quebra a tela", () => {
    expect(
      computeGoalProgress(
        { metric: "tamanho_da_asa", target_value: 10, start_value: 5, start_on: "2026-04-01", target_date: null },
        history
      )
    ).toBeNull();
  });
});
