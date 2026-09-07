import { describe, expect, it } from "vitest";
import { parseModelJson } from "./parse-json";

describe("parseModelJson", () => {
  it("lê JSON limpo", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("descasca cerca de markdown", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recorta objeto cercado de prosa", () => {
    expect(parseModelJson('Claro! Segue:\n{"a":1}\nEspero ter ajudado.')).toEqual({ a: 1 });
  });

  it("devolve null em vez de adivinhar quando não há JSON", () => {
    expect(parseModelJson("não consegui ler o rótulo")).toBeNull();
    expect(parseModelJson("")).toBeNull();
    expect(parseModelJson(null)).toBeNull();
    expect(parseModelJson('{"a": }')).toBeNull();
  });

  it("preserva acento e traço dentro das strings", () => {
    expect(parseModelJson('{"nome":"Ácido alfa-lipoico"}')).toEqual({
      nome: "Ácido alfa-lipoico",
    });
  });
});
