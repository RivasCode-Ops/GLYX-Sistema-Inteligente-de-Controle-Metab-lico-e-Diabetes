import { describe, expect, it } from "vitest";
import { groupByCategory, resolveStrengthEntry, type CatalogExercise } from "@/lib/exercicios/catalog";

function exercise(over: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "supino-reto-barra",
    name: "Supino reto com barra",
    mechanic: "resistencia",
    primaryMuscle: "peito",
    secondaryMuscles: [],
    sourceCategory: "Peito",
    ...over,
  };
}

describe("groupByCategory", () => {
  it("agrupa pela categoria de origem preservando a ordem de chegada", () => {
    const groups = groupByCategory([
      exercise({ id: "1", name: "Supino reto", sourceCategory: "Peito" }),
      exercise({ id: "2", name: "Remada baixa", sourceCategory: "Costas" }),
      exercise({ id: "3", name: "Crucifixo", sourceCategory: "Peito" }),
    ]);

    expect(groups.map((g) => g.category)).toEqual(["Peito", "Costas"]);
    expect(groups[0].exercises.map((e) => e.name)).toEqual(["Supino reto", "Crucifixo"]);
  });

  it("mantém junto o exercício cuja categoria diverge do músculo primário", () => {
    // Elevação pélvica vem em "Pernas" e é de glúteos: quem procura na lista
    // procura onde aprendeu, então a navegação segue a categoria.
    const groups = groupByCategory([
      exercise({ id: "1", name: "Agachamento", primaryMuscle: "quadriceps", sourceCategory: "Pernas" }),
      exercise({ id: "2", name: "Elevação pélvica", primaryMuscle: "gluteos", sourceCategory: "Pernas" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].exercises.map((e) => e.primaryMuscle)).toEqual(["quadriceps", "gluteos"]);
  });

  it("devolve lista vazia sem exercícios", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("resolveStrengthEntry", () => {
  it("deriva nome e músculo do catálogo, ignorando o que veio do formulário", () => {
    const resolved = resolveStrengthEntry(exercise(), "supino RETO c/ barra");

    expect(resolved).toEqual({
      exerciseId: "00000000-0000-0000-0000-000000000001",
      exerciseName: "Supino reto com barra",
      muscleGroup: "peito",
    });
  });

  it("grava cardio sem músculo em vez de aproximar um", () => {
    const resolved = resolveStrengthEntry(
      exercise({ slug: "esteira", name: "Esteira", mechanic: "cardio", primaryMuscle: null }),
      ""
    );

    expect(resolved?.muscleGroup).toBeNull();
    expect(resolved?.exerciseName).toBe("Esteira");
  });

  it("aceita texto livre sem inventar músculo a partir do nome", () => {
    const resolved = resolveStrengthEntry(null, "  Crossover na polia  ");

    expect(resolved).toEqual({
      exerciseId: null,
      exerciseName: "Crossover na polia",
      muscleGroup: null,
    });
  });

  it("recusa quando não há nem exercício do catálogo nem nome digitado", () => {
    expect(resolveStrengthEntry(null, "   ")).toBeNull();
    expect(resolveStrengthEntry(null, "")).toBeNull();
  });
});
