import { describe, expect, it } from "vitest";
import { buildExamParameterSeries, parseReferenceRange } from "./parameter-series";

function exam(created_at: string, values: { parameter: string; value: string; referenceRange?: string; status?: string }[]) {
  return {
    created_at,
    parsed_summary: {
      summary: "resumo",
      values: values.map((v) => ({ status: "normal", ...v })),
      terms: [],
      questionsForDoctor: [],
      limitations: "",
    },
  };
}

describe("buildExamParameterSeries", () => {
  it("agrupa o mesmo parâmetro em exames diferentes numa série cronológica", () => {
    const series = buildExamParameterSeries([
      exam("2026-01-01T00:00:00Z", [{ parameter: "Colesterol total", value: "220 mg/dL", referenceRange: "<200" }]),
      exam("2026-03-01T00:00:00Z", [{ parameter: "Colesterol Total", value: "190 mg/dL", status: "atencao" }]),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].parameter).toBe("Colesterol total");
    expect(series[0].unit).toBe("mg/dL");
    expect(series[0].points.map((p) => p.value)).toEqual([220, 190]);
    expect(series[0].points[0].date).toBe("2026-01-01T00:00:00Z");
  });

  it("ignora parâmetro que só aparece em um exame (sem evolução pra mostrar)", () => {
    const series = buildExamParameterSeries([
      exam("2026-01-01T00:00:00Z", [{ parameter: "Ureia", value: "30 mg/dL" }]),
    ]);
    expect(series).toEqual([]);
  });

  it("ignora exames com parsed_summary inválido em vez de quebrar", () => {
    const series = buildExamParameterSeries([
      { created_at: "2026-01-01T00:00:00Z", parsed_summary: null },
      exam("2026-02-01T00:00:00Z", [{ parameter: "HbA1c", value: "6,1%" }]),
      exam("2026-03-01T00:00:00Z", [{ parameter: "HbA1c", value: "5.8%" }]),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].points.map((p) => p.value)).toEqual([6.1, 5.8]);
  });
});

describe("parseReferenceRange", () => {
  it("extrai mínimo e máximo de uma faixa tipo '70-100 mg/dL'", () => {
    expect(parseReferenceRange("70-100 mg/dL")).toEqual([70, 100]);
  });

  it("retorna null para faixas sem dois números (ex.: '<200')", () => {
    expect(parseReferenceRange("<200")).toBeNull();
    expect(parseReferenceRange(null)).toBeNull();
  });
});
