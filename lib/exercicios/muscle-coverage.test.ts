import { describe, expect, it } from "vitest";
import { MUSCLE_GROUPS, MUSCLE_GROUP_IDS, MUSCLE_GROUP_BY_ID } from "@/lib/data/muscle-groups";
import { MUSCLE_SPLITS } from "@/lib/exercicios/muscle-recovery";
import { WEEKDAY_PLAN } from "@/lib/exercicios/training-plan";
import { WEEKLY_SET_TARGET } from "@/lib/exercicios/weekly-volume";

/**
 * Invariantes de **cobertura**: todo grupo muscular tem que ser alcançável pelos
 * consumidores.
 *
 * O compilador cobre o que é `Record<MuscleGroupId, _>` — `WEEKLY_SET_TARGET` e a
 * definição dos grupos. Não cobre `MUSCLE_SPLITS` nem `WEEKDAY_PLAN`, que são
 * listas onde um músculo pode legitimamente aparecer em vários lugares (ou em
 * nenhum, sem erro de tipo). Um grupo fora dos dois não quebra nada: ele apenas
 * nunca é sugerido para treinar — some do produto em silêncio.
 *
 * Foi exatamente esse o caso de trapézio e glúteos ao entrarem no modelo: o plano
 * de 5 dias nunca os representou. Estes testes tornam o encaixe obrigatório em
 * vez de opcional.
 */
describe("cobertura dos grupos musculares", () => {
  it("todo grupo tem alvo de volume semanal", () => {
    for (const id of MUSCLE_GROUP_IDS) {
      const target = WEEKLY_SET_TARGET[id];
      expect(target, id).toBeDefined();
      expect(target.min, id).toBeGreaterThan(0);
      expect(target.optimal, id).toBeGreaterThanOrEqual(target.min);
    }
  });

  it("todo grupo aparece em pelo menos um split", () => {
    const cobertos = new Set(MUSCLE_SPLITS.flatMap((s) => s.groups));
    for (const id of MUSCLE_GROUP_IDS) {
      expect(cobertos.has(id), `${id} não está em nenhum split`).toBe(true);
    }
  });

  it("todo grupo aparece em pelo menos um dia do plano semanal", () => {
    const cobertos = new Set(Object.values(WEEKDAY_PLAN).flatMap((d) => d.groups));
    for (const id of MUSCLE_GROUP_IDS) {
      expect(cobertos.has(id), `${id} não está em nenhum dia do plano`).toBe(true);
    }
  });

  /**
   * A lista é derivada do `Record`, então divergir seria sintoma de alguém ter
   * voltado a escrevê-la à mão — que é o que permitia o sumiço silencioso.
   */
  it("a lista exibida cobre exatamente os ids declarados", () => {
    expect(MUSCLE_GROUPS.map((g) => g.id).sort()).toEqual([...MUSCLE_GROUP_IDS].sort());
    for (const id of MUSCLE_GROUP_IDS) {
      expect(MUSCLE_GROUP_BY_ID[id].id, id).toBe(id);
    }
  });

  it("ordena por displayOrder e não repete posição", () => {
    const ordens = MUSCLE_GROUPS.map((g) => g.displayOrder);
    expect(ordens).toEqual([...ordens].sort((a, b) => a - b));
    expect(new Set(ordens).size).toBe(ordens.length);
  });

  it("mantém trapézio no dia de ombros e glúteos no dia de pernas — a ficha, não a convenção", () => {
    const terca = WEEKDAY_PLAN[2];
    const segunda = WEEKDAY_PLAN[1];
    expect(terca.groups).toContain("ombros");
    expect(terca.groups).toContain("trapezio");
    expect(segunda.groups).toContain("quadriceps");
    expect(segunda.groups).toContain("gluteos");
  });
});
