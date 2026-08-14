import { describe, expect, it } from "vitest";
import { computeIndirectVolume, indirectSetsPerWeek } from "./indirect-volume";
import type { CatalogExercise } from "./catalog";

const DIA = 86_400_000;
const AGORA = new Date("2026-08-14T12:00:00.000Z");

function em(diasAtras: number): string {
  return new Date(AGORA.getTime() - diasAtras * DIA).toISOString();
}

const SUPINO: CatalogExercise = {
  id: "sup",
  slug: "supino-reto-barra",
  name: "Supino reto com barra",
  mechanic: "resistencia",
  primaryMuscle: "peito",
  secondaryMuscles: ["triceps", "ombros"],
  sourceCategory: "Peito",
};

const ROSCA: CatalogExercise = {
  id: "ros",
  slug: "rosca-direta-barra",
  name: "Rosca direta com barra",
  mechanic: "resistencia",
  primaryMuscle: "biceps",
  secondaryMuscles: [],
  sourceCategory: "Bíceps / antebraço",
};

const CATALOGO = [SUPINO, ROSCA];

describe("computeIndirectVolume", () => {
  it("credita os secundários do composto", () => {
    const totals = computeIndirectVolume(
      [{ exercise_id: "sup", sets: 4, logged_at: em(2) }],
      CATALOGO,
      4,
      AGORA
    );

    expect(totals.get("triceps")).toBe(4);
    expect(totals.get("ombros")).toBe(4);
  });

  it("não credita o primário — ele já está no volume direto", () => {
    // Somar peito aqui dobraria a contagem do grupo que o exercício treina.
    const totals = computeIndirectVolume(
      [{ exercise_id: "sup", sets: 4, logged_at: em(1) }],
      CATALOGO,
      4,
      AGORA
    );

    expect(totals.has("peito")).toBe(false);
  });

  it("isolador não gera série indireta", () => {
    const totals = computeIndirectVolume(
      [{ exercise_id: "ros", sets: 3, logged_at: em(1) }],
      CATALOGO,
      4,
      AGORA
    );

    expect(totals.size).toBe(0);
  });

  it("soma séries de registros diferentes no mesmo músculo", () => {
    const totals = computeIndirectVolume(
      [
        { exercise_id: "sup", sets: 4, logged_at: em(1) },
        { exercise_id: "sup", sets: 3, logged_at: em(5) },
      ],
      CATALOGO,
      4,
      AGORA
    );

    expect(totals.get("triceps")).toBe(7);
  });

  it("ignora registro fora da janela", () => {
    const totals = computeIndirectVolume(
      [{ exercise_id: "sup", sets: 4, logged_at: em(60) }],
      CATALOGO,
      4,
      AGORA
    );

    expect(totals.size).toBe(0);
  });

  it("ignora registro por texto livre, que não tem vetor de ativação", () => {
    const totals = computeIndirectVolume(
      [{ exercise_id: null, sets: 4, logged_at: em(1) }],
      CATALOGO,
      4,
      AGORA
    );

    expect(totals.size).toBe(0);
  });

  it("ignora exercício que saiu do catálogo", () => {
    const totals = computeIndirectVolume(
      [{ exercise_id: "sumiu", sets: 4, logged_at: em(1) }],
      CATALOGO,
      4,
      AGORA
    );

    expect(totals.size).toBe(0);
  });
});

describe("indirectSetsPerWeek", () => {
  it("divide pela janela com uma casa, como o volume direto", () => {
    const porSemana = indirectSetsPerWeek(new Map([["triceps", 10]]), 4);

    expect(porSemana.get("triceps")).toBe(2.5);
  });

  it("não divide por zero quando a janela é degenerada", () => {
    expect(indirectSetsPerWeek(new Map([["triceps", 8]]), 0).get("triceps")).toBe(8);
  });
});
