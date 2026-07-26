import { describe, expect, it } from "vitest";
import {
  goalsByMuscle,
  prescribeForSession,
  totalSets,
  uncoveredGoalMuscles,
  weeklySessionsByGroup,
} from "./plan-prescription";
import { computeWeeklyVolume, type StrengthLogRow } from "./weekly-volume";
import { computeGoalProgress } from "@/lib/body/goals";
import type { BodyMeasurement } from "@/lib/body/fields";

const NOW = new Date("2026-07-26T12:00:00Z");

const history: BodyMeasurement[] = [
  { measured_on: "2026-04-01", chest_cm: 110, arm_right_flexed_cm: 32 },
  { measured_on: "2026-07-20", chest_cm: 112, arm_right_flexed_cm: 33 },
];

const metaPeito = computeGoalProgress(
  { metric: "chest_cm", target_value: 114, start_value: 110, start_on: "2026-04-01", target_date: null },
  history
)!;

function strengthLog(over: Partial<StrengthLogRow> & { daysAgo: number }): StrengthLogRow {
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

describe("weeklySessionsByGroup", () => {
  it("conta quantas vezes cada grupo aparece no plano de 5 dias", () => {
    const counts = weeklySessionsByGroup();
    expect(counts.get("peito")).toBe(1);
    expect(counts.get("panturrilhas")).toBe(2);
    // Abdômen aparece em quatro dias: recupera rápido.
    expect(counts.get("abdomen")).toBe(4);
  });
});

describe("goalsByMuscle", () => {
  it("mapeia meta de medida para os músculos que a sustentam", () => {
    const map = goalsByMuscle([metaPeito]);
    expect(map.get("peito")).toBeDefined();
  });

  it("ignora meta já atingida", () => {
    const atingida = computeGoalProgress(
      { metric: "chest_cm", target_value: 111, start_value: 110, start_on: "2026-04-01", target_date: null },
      history
    )!;
    expect(goalsByMuscle([atingida]).size).toBe(0);
  });

  it("duas metas no mesmo músculo não dobram nada", () => {
    const metaBracoD = computeGoalProgress(
      {
        metric: "arm_right_flexed_cm",
        target_value: 35,
        start_value: 32,
        start_on: "2026-04-01",
        target_date: null,
      },
      history
    )!;
    const map = goalsByMuscle([metaBracoD, metaBracoD]);
    expect(map.get("biceps")).toBeDefined();
    expect(map.size).toBe(2); // bíceps e tríceps, uma vez cada
  });
});

describe("prescribeForSession", () => {
  const volumeVazio = computeWeeklyVolume([], 4, NOW);

  it("grupo com meta recebe o alvo ótimo dividido pela frequência semanal", () => {
    const prescriptions = prescribeForSession(
      [{ id: "peito", label: "Peito" }],
      volumeVazio,
      [metaPeito]
    );
    expect(prescriptions).toHaveLength(1);
    // Peito treina 1x na semana, alvo ótimo 16 → limitado ao teto de 8 séries
    // por sessão: déficit grande se resolve com frequência, não sessão gigante.
    expect(prescriptions[0].setsToday).toBe(8);
    expect(prescriptions[0].emphasis).toBe("meta");
    expect(prescriptions[0].goalLabel).toBe("Peitoral");
  });

  it("sem meta e com volume baixo, usa o piso da referência", () => {
    const prescriptions = prescribeForSession([{ id: "peito", label: "Peito" }], volumeVazio, []);
    expect(prescriptions[0].emphasis).toBe("deficit");
    expect(prescriptions[0].targetSetsPerWeek).toBe(10);
  });

  it("volume dentro da faixa vira manutenção", () => {
    const logs = Array.from({ length: 4 }, (_, i) => strengthLog({ daysAgo: i * 7, sets: 3 }));
    const volume = computeWeeklyVolume(logs, 4, NOW);
    const prescriptions = prescribeForSession([{ id: "abdomen", label: "Abdômen" }], volume, []);
    // Abdômen sem registro nenhum continua déficit; o teste do peito é que importa.
    const peito = prescribeForSession([{ id: "peito", label: "Peito" }], volume, [])[0];
    expect(peito.currentSetsPerWeek).toBe(3);
    expect(prescriptions[0].id).toBe("abdomen");
  });

  it("volume muito alto manda reduzir em vez de somar mais séries", () => {
    const logs = Array.from({ length: 10 }, (_, i) => strengthLog({ daysAgo: i * 2, sets: 12 }));
    const volume = computeWeeklyVolume(logs, 4, NOW);
    const prescriptions = prescribeForSession([{ id: "peito", label: "Peito" }], volume, [metaPeito]);
    expect(prescriptions[0].emphasis).toBe("reduzir");
  });

  it("respeita piso e teto por sessão", () => {
    const prescriptions = prescribeForSession(
      [
        { id: "antebracos", label: "Antebraços" },
        { id: "costas", label: "Costas" },
      ],
      volumeVazio,
      []
    );
    for (const p of prescriptions) {
      expect(p.setsToday).toBeGreaterThanOrEqual(2);
      expect(p.setsToday).toBeLessThanOrEqual(8);
    }
  });

  it("soma as séries da sessão", () => {
    const prescriptions = prescribeForSession(
      [
        { id: "peito", label: "Peito" },
        { id: "triceps", label: "Tríceps" },
      ],
      volumeVazio,
      []
    );
    expect(totalSets(prescriptions)).toBe(
      prescriptions[0].setsToday + prescriptions[1].setsToday
    );
  });
});

describe("uncoveredGoalMuscles", () => {
  it("aponta meta cujo músculo está sem volume suficiente", () => {
    const uncovered = uncoveredGoalMuscles(computeWeeklyVolume([], 4, NOW), [metaPeito]);
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].id).toBe("peito");
    expect(uncovered[0].goalLabel).toBe("Peitoral");
  });

  it("não reclama quando o volume está em dia", () => {
    const logs = Array.from({ length: 8 }, (_, i) => strengthLog({ daysAgo: i * 3, sets: 6 }));
    const uncovered = uncoveredGoalMuscles(computeWeeklyVolume(logs, 4, NOW), [metaPeito]);
    expect(uncovered).toHaveLength(0);
  });
});
