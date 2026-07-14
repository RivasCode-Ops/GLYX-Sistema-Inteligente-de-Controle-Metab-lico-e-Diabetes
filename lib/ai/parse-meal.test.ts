import { describe, expect, it } from "vitest";
import { parseMealJson, sumMealItems } from "./parse-meal";

describe("parseMealJson", () => {
  it("parseia JSON puro", () => {
    const out = parseMealJson('{"name":"Almoço","calories":520,"carbs_g":62}');
    expect(out.name).toBe("Almoço");
    expect(out.calories).toBe(520);
  });

  it("remove cerca markdown ```json antes de parsear", () => {
    const out = parseMealJson('```json\n{"name":"Jantar","carbs_g":40}\n```');
    expect(out.name).toBe("Jantar");
    expect(out.carbs_g).toBe(40);
  });

  it("resposta inválida vira análise pendente preservando o texto", () => {
    const out = parseMealJson("desculpe, não consegui analisar");
    expect(out.name).toBe("análise pendente");
    expect(out.notes).toBe("desculpe, não consegui analisar");
  });
});

describe("sumMealItems", () => {
  it("soma os macros de todos os itens em vez de ficar só com o primeiro", () => {
    const parsed = parseMealJson(
      JSON.stringify({
        items: [
          { name: "Omelete", calories: 220, carbs_g: 2, protein_g: 18, fat_g: 16 },
          { name: "Bolo de goma (2un)", calories: 260, carbs_g: 48, protein_g: 4, fat_g: 6 },
          { name: "Caldo de carne", calories: 90, carbs_g: 6, protein_g: 8, fat_g: 3 },
        ],
      })
    );
    const out = sumMealItems(parsed);
    expect(out.items).toHaveLength(3);
    expect(out.calories).toBe(570);
    expect(out.carbs_g).toBe(56);
    expect(out.protein_g).toBe(30);
    expect(out.fat_g).toBe(25);
    expect(out.name).toBe("Omelete + Bolo de goma (2un) + Caldo de carne");
  });

  it("sem items, cai no comportamento antigo (name / zeros)", () => {
    const parsed = parseMealJson('{"name":"análise pendente"}');
    const out = sumMealItems(parsed);
    expect(out.items).toHaveLength(0);
    expect(out.calories).toBe(0);
    expect(out.name).toBe("análise pendente");
  });
});
