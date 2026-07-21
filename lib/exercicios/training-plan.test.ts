import { describe, expect, it } from "vitest";
import { computeMuscleRecovery } from "./muscle-recovery";
import { getTrainingDay, getWeekPlan, planSummaryLabel, suggestFromPlan } from "./training-plan";
import type { MuscleGroupId } from "@/lib/data/muscle-groups";

// 2026-07-13 Ã© uma segunda-feira.
const SEGUNDA = new Date("2026-07-13T12:00:00");
const QUINTA = new Date("2026-07-16T12:00:00");
const SABADO = new Date("2026-07-18T12:00:00");
const DOMINGO = new Date("2026-07-19T12:00:00");

describe("getTrainingDay", () => {
  it("devolve o treino do dia Ãºtil correspondente", () => {
    expect(getTrainingDay(SEGUNDA).id).toBe("inferior-a");
    expect(getTrainingDay(QUINTA).id).toBe("superior-b");
  });

  it("devolve descanso no fim de semana", () => {
    expect(getTrainingDay(SABADO).id).toBe("descanso");
    expect(getTrainingDay(DOMINGO).id).toBe("descanso");
  });
});

describe("getWeekPlan", () => {
  it("cobre os cinco dias Ãºteis sem repetir treino", () => {
    const week = getWeekPlan();
    expect(week).toHaveLength(5);
    expect(week.map((w) => w.day.id)).toEqual([
      "inferior-a",
      "superior-a",
      "inferior-b",
      "superior-b",
      "full-body",
    ]);
  });

  it("treina os grupos grandes 2x por semana", () => {
    const groups = getWeekPlan().flatMap((w) => w.day.groups);
    expect(groups.filter((g) => g === "pernas")).toHaveLength(2);
    expect(groups.filter((g) => g === "panturrilhas")).toHaveLength(2);
  });

  it("dÃ¡ frequÃªncia maior aos grupos de recuperaÃ§Ã£o rÃ¡pida", () => {
    const groups = getWeekPlan().flatMap((w) => w.day.groups);
    // abdÃ´men recupera em 24h â€” aparece mais que os grupos grandes.
    expect(groups.filter((g) => g === "abdomen").length).toBeGreaterThan(2);
  });
});


/** Marca todos os grupos como treinados hÃ¡ `hours` horas, exceto os listados. */
function trainedExcept(except: MuscleGroupId[], hours: number, now: Date) {
  const at = new Date(now.getTime() - hours * 3_600_000).toISOString();
  const all: MuscleGroupId[] = [
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
  return Object.fromEntries(
    all.filter((g) => !except.includes(g)).map((g) => [g, at])
  ) as Partial<Record<MuscleGroupId, string>>;
}

describe("suggestFromPlan", () => {
  it("mantÃ©m o dia agendado quando os grupos estÃ£o recuperados", () => {
    const statuses = computeMuscleRecovery({}, {}, SEGUNDA);
    const s = suggestFromPlan(statuses, SEGUNDA);

    expect(s.swapped).toBe(false);
    expect(s.suggested.id).toBe("inferior-a");
    expect(s.included.length).toBeGreaterThan(0);
  });

  it("limita os grupos ao tempo da sessÃ£o", () => {
    const statuses = computeMuscleRecovery({}, {}, SEGUNDA);
    const s = suggestFromPlan(statuses, SEGUNDA, 30);

    // 30 min sÃ³ dÃ¡ pra um grupo bem feito.
    expect(s.included).toHaveLength(1);
    expect(s.deferred.length).toBeGreaterThan(0);
  });

  it("troca de dia quando o treino agendado estÃ¡ todo saturado", () => {
    // SÃ³ costas/bÃ­ceps/antebraÃ§o recuperados â€” o resto treinado hÃ¡ 1h.
    const lastTrained = trainedExcept(["costas", "biceps", "antebracos"], 1, SEGUNDA);
    const statuses = computeMuscleRecovery(lastTrained, {}, SEGUNDA);
    const s = suggestFromPlan(statuses, SEGUNDA);

    expect(s.scheduled.id).toBe("inferior-a");
    expect(s.swapped).toBe(true);
    expect(s.suggested.id).toBe("superior-b");
    expect(s.reason).toContain("antecipe");
  });

  it("manda descansar quando nada estÃ¡ recuperado", () => {
    const lastTrained = trainedExcept([], 1, SEGUNDA);
    const statuses = computeMuscleRecovery(lastTrained, {}, SEGUNDA);
    const s = suggestFromPlan(statuses, SEGUNDA);

    expect(s.swapped).toBe(false);
    expect(s.included).toHaveLength(0);
    expect(s.reason).toContain("Nenhum grupo recuperado");
  });

  it("nÃ£o sugere treino em dia de descanso do plano", () => {
    const statuses = computeMuscleRecovery({}, {}, DOMINGO);
    const s = suggestFromPlan(statuses, DOMINGO);

    expect(s.suggested.id).toBe("descanso");
    expect(s.included).toHaveLength(0);
    expect(s.reason).toContain("descanso");
  });

  it("nunca sugere grupo pausado manualmente", () => {
    const statuses = computeMuscleRecovery({}, { pernas: "dor no joelho" }, SEGUNDA);
    const s = suggestFromPlan(statuses, SEGUNDA);

    expect(s.included.map((i) => i.id)).not.toContain("pernas");
    expect(s.resting.map((r) => r.id)).toContain("pernas");
  });
});

describe("planSummaryLabel", () => {
  it("mostra o treino do dia quando o plano segue normal", () => {
    const statuses = computeMuscleRecovery({}, {}, SEGUNDA);
    expect(planSummaryLabel(suggestFromPlan(statuses, SEGUNDA))).toBe("Hoje: Inferior A");
  });

  it("avisa quando a recuperação antecipou outro dia", () => {
    const lastTrained = trainedExcept(["costas", "biceps", "antebracos"], 1, SEGUNDA);
    const statuses = computeMuscleRecovery(lastTrained, {}, SEGUNDA);
    expect(planSummaryLabel(suggestFromPlan(statuses, SEGUNDA))).toBe("Antecipe: Superior B");
  });

  it("mostra descanso no fim de semana", () => {
    const statuses = computeMuscleRecovery({}, {}, DOMINGO);
    expect(planSummaryLabel(suggestFromPlan(statuses, DOMINGO))).toBe("Descanso");
  });

  it("mostra recuperação total quando nada está pronto", () => {
    const statuses = computeMuscleRecovery(trainedExcept([], 1, SEGUNDA), {}, SEGUNDA);
    expect(planSummaryLabel(suggestFromPlan(statuses, SEGUNDA))).toBe("Tudo em recuperação");
  });
});
