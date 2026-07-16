import { describe, expect, it } from "vitest";
import { extractImportableValues } from "./import-values";

describe("extractImportableValues", () => {
  it("detecta glicose de jejum em mg/dL", () => {
    const out = extractImportableValues([
      { parameter: "Glicose em jejum", value: "126 mg/dL" },
      { parameter: "Colesterol total", value: "190 mg/dL" },
    ]);
    expect(out).toEqual([
      { kind: "glucose_jejum", label: "Glicose em jejum: 126 mg/dL", mgDl: 126 },
    ]);
  });

  it("detecta peso em kg com vírgula decimal", () => {
    const out = extractImportableValues([{ parameter: "Peso corporal", value: "82,5 kg" }]);
    expect(out).toEqual([{ kind: "weight", label: "Peso corporal: 82,5 kg", weightKg: 82.5 }]);
  });

  it("ignora peso molecular e valores fora de faixa plausível", () => {
    const out = extractImportableValues([
      { parameter: "Peso molecular", value: "180 g/mol" },
      { parameter: "Peso", value: "900 kg" },
      { parameter: "Glicemia de jejum", value: "1200 mg/dL" },
    ]);
    expect(out).toEqual([]);
  });

  it("glicemia sem 'jejum' no nome não é importável (contexto ambíguo)", () => {
    const out = extractImportableValues([{ parameter: "Glicose", value: "110 mg/dL" }]);
    expect(out).toEqual([]);
  });
});
