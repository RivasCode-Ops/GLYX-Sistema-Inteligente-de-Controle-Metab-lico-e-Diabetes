import { describe, expect, it } from "vitest";
import { lastLoggedByExercise, pickExercisesForGroup } from "./exercise-picker";
import type { CatalogExercise } from "./catalog";

function ex(id: string, name: string, muscle: CatalogExercise["primaryMuscle"]): CatalogExercise {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    mechanic: "resistencia",
    primaryMuscle: muscle,
    sourceCategory: "Peito",
  };
}

const PEITO = [
  ex("1", "Supino reto com barra", "peito"),
  ex("2", "Supino inclinado com halteres", "peito"),
  ex("3", "Crucifixo inclinado", "peito"),
  ex("4", "Supino reto com halteres", "peito"),
];

const CATALOGO: CatalogExercise[] = [
  ...PEITO,
  ex("5", "Remada baixa", "costas"),
  { ...ex("6", "Esteira", null), mechanic: "cardio", sourceCategory: "Cardio" },
];

describe("pickExercisesForGroup", () => {
  it("cobre as séries do dia com exercícios do músculo pedido", () => {
    const picks = pickExercisesForGroup(CATALOGO, "peito", 6);

    expect(picks).toHaveLength(2);
    expect(picks.reduce((s, p) => s + p.sets, 0)).toBe(6);
    expect(picks.every((p) => p.exercise.primaryMuscle === "peito")).toBe(true);
  });

  it("prioriza o que o usuário já registrou, do mais recente para o mais antigo", () => {
    // É o que torna a progressão de carga mensurável: trocar de exercício zera
    // a comparação com a última vez.
    const historico = new Map([
      ["3", "2026-08-01T10:00:00.000Z"],
      ["2", "2026-08-10T10:00:00.000Z"],
    ]);

    const picks = pickExercisesForGroup(CATALOGO, "peito", 6, historico);

    expect(picks.map((p) => p.exercise.id)).toEqual(["2", "3"]);
    expect(picks[0].lastLoggedAt).toBe("2026-08-10T10:00:00.000Z");
  });

  it("completa com exercício novo quando o histórico não cobre", () => {
    const historico = new Map([["3", "2026-08-01T10:00:00.000Z"]]);

    const picks = pickExercisesForGroup(CATALOGO, "peito", 6, historico);

    expect(picks[0].exercise.id).toBe("3");
    expect(picks[1].lastLoggedAt).toBeNull();
  });

  it("distribui as séries com a sobra na frente", () => {
    const picks = pickExercisesForGroup(CATALOGO, "peito", 7);

    expect(picks.map((p) => p.sets)).toEqual([4, 3]);
  });

  it("usa um exercício só quando o volume é pequeno", () => {
    expect(pickExercisesForGroup(CATALOGO, "peito", 2)).toHaveLength(1);
    expect(pickExercisesForGroup(CATALOGO, "peito", 2)[0].sets).toBe(2);
  });

  it("respeita o teto de três exercícios por grupo", () => {
    const picks = pickExercisesForGroup(CATALOGO, "peito", 20);

    expect(picks).toHaveLength(3);
    expect(picks.reduce((s, p) => s + p.sets, 0)).toBe(20);
  });

  it("nunca sugere cardio, que não responde a prescrição de séries", () => {
    const picks = pickExercisesForGroup(CATALOGO, "peito", 6);

    expect(picks.every((p) => p.exercise.mechanic === "resistencia")).toBe(true);
  });

  it("devolve vazio para músculo sem exercício no catálogo", () => {
    expect(pickExercisesForGroup(CATALOGO, "panturrilhas", 4)).toEqual([]);
  });

  it("devolve vazio quando não há séries a distribuir", () => {
    expect(pickExercisesForGroup(CATALOGO, "peito", 0)).toEqual([]);
  });
});

describe("lastLoggedByExercise", () => {
  it("guarda o registro mais recente de cada exercício", () => {
    const mapa = lastLoggedByExercise([
      { exercise_id: "1", logged_at: "2026-08-01T10:00:00.000Z" },
      { exercise_id: "1", logged_at: "2026-08-09T10:00:00.000Z" },
      { exercise_id: "2", logged_at: "2026-08-05T10:00:00.000Z" },
    ]);

    expect(mapa.get("1")).toBe("2026-08-09T10:00:00.000Z");
    expect(mapa.get("2")).toBe("2026-08-05T10:00:00.000Z");
  });

  it("ignora registro por texto livre, que não tem elo com o catálogo", () => {
    const mapa = lastLoggedByExercise([
      { exercise_id: null, logged_at: "2026-08-09T10:00:00.000Z" },
    ]);

    expect(mapa.size).toBe(0);
  });
});
