import { describe, expect, it } from "vitest";
import {
  isUnusableCompletion,
  mealEstimateError,
  parseMealJson,
  sumMealItems,
  validateMealEstimate,
} from "./parse-meal";

const item = (o: Record<string, unknown> = {}) => ({
  name: "Arroz",
  calories: 200,
  carbs_g: 44,
  protein_g: 4,
  fat_g: 0.5,
  ...o,
});

describe("validateMealEstimate (GLYX-27 / P12)", () => {
  it("aceita estimativa plausível e soma os itens", () => {
    const r = validateMealEstimate(
      JSON.stringify({ items: [item(), item({ name: "Feijão", carbs_g: 20 })], glycemic_load_estimate: 30 })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totals.carbs_g).toBe(64);
    expect(r.glycemicLoad).toBe(30);
  });

  it("JSON ilegível é falha, não refeição zerada", () => {
    const r = validateMealEstimate("desculpe, não consegui analisar");
    expect(r).toMatchObject({ ok: false, motivo: "json_invalido" });
  });

  it("sem itens é falha declarada", () => {
    expect(validateMealEstimate('{"items":[]}')).toMatchObject({ ok: false, motivo: "sem_itens" });
    expect(validateMealEstimate('{"name":"x"}')).toMatchObject({ ok: false, motivo: "sem_itens" });
  });

  it.each([
    ["carboidrato negativo", { carbs_g: -50 }],
    ["carboidrato absurdo num item", { carbs_g: 9000 }],
    ["caloria em texto", { calories: "muitas" }],
    ["campo ausente", { protein_g: undefined }],
    ["NaN", { fat_g: Number.NaN }],
  ])("%s reprova a estimativa inteira", (_, o) => {
    const r = validateMealEstimate(JSON.stringify({ items: [item(), item(o)] }));
    expect(r).toMatchObject({ ok: false, motivo: "fora_da_faixa" });
  });

  it("número em string é aceito e convertido", () => {
    const r = validateMealEstimate(JSON.stringify({ items: [item({ carbs_g: "44" })] }));
    expect(r.ok && r.totals.carbs_g).toBe(44);
  });

  it("carga glicêmica inválida some em vez de virar 0", () => {
    const r = validateMealEstimate(
      JSON.stringify({
        items: [item({ glycemic_load_estimate: 250 }), item({ glycemic_load_estimate: 20 })],
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totals.items[0].glycemic_load_estimate).toBeUndefined();
    expect(r.glycemicLoad).toBe(20);
  });

  it("sem carga glicêmica nenhuma, o conjunto fica null", () => {
    const r = validateMealEstimate(JSON.stringify({ items: [item()] }));
    expect(r.ok && r.glycemicLoad).toBeNull();
  });

  it("erro: sem itens é 422, valor estranho é 502", () => {
    expect(mealEstimateError("sem_itens", "foto").status).toBe(422);
    expect(mealEstimateError("fora_da_faixa", "texto").status).toBe(502);
    expect(mealEstimateError("json_invalido", "texto").status).toBe(502);
  });
});

describe("isUnusableCompletion", () => {
  it("rejeita resposta cortada no teto de tokens", () => {
    // Caso real: modelo de raciocínio gastou todo o max_tokens pensando.
    expect(isUnusableCompletion("", "length")).toBe(true);
    expect(isUnusableCompletion('{"items":[', "length")).toBe(true);
  });

  it("rejeita conteúdo vazio ou ausente", () => {
    expect(isUnusableCompletion(null)).toBe(true);
    expect(isUnusableCompletion(undefined)).toBe(true);
    expect(isUnusableCompletion("   ")).toBe(true);
  });

  it("aceita resposta completa", () => {
    expect(isUnusableCompletion('{"items":[]}', "stop")).toBe(false);
    expect(isUnusableCompletion('```json\n{"items":[]}\n```', "stop")).toBe(false);
  });
});

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
