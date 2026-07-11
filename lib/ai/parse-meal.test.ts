import { describe, expect, it } from "vitest";
import { parseMealJson } from "./parse-meal";

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
