import { describe, expect, it } from "vitest";
import { countAlteredSignals, countOutOfReference, examPhotoResultSchema, parseExamType } from "@/lib/exams/types";

describe("exam types / clinical vision", () => {
  it("parseExamType faz fallback para lab", () => {
    expect(parseExamType("ecg")).toBe("ecg");
    expect(parseExamType("rx")).toBe("rx");
    expect(parseExamType("foo")).toBe("lab");
  });

  it("aceita schema de ECG com findings", () => {
    const parsed = examPhotoResultSchema.safeParse({
      modality: "ecg",
      extractedText: "Traçado com marcações de FC 72 bpm",
      suggestedTitle: "ECG jul/2026",
      summary: "Imagem de ECG com frequência impressa; sem conclusão clínica.",
      imageQuality: "parcialmente legível",
      findings: [
        {
          finding: "Frequência impressa ~72 bpm",
          plainLanguage: "O aparelho imprimiu cerca de 72 batimentos por minuto.",
          severity: "info",
        },
      ],
      terms: [{ term: "ECG", plainLanguage: "Registro elétrico do coração." }],
      questionsForDoctor: ["Este traçado é comparável aos meus ECGs anteriores?"],
      lifestyleTopics: [],
      limitations: "Foto pode distorcer o traçado; não substitui laudo cardiológico.",
    });
    expect(parsed.success).toBe(true);
  });

  it("countAlteredSignals soma values e findings", () => {
    expect(
      countAlteredSignals({
        summary: "x",
        terms: [],
        questionsForDoctor: [],
        limitations: "x",
        values: [{ parameter: "Glicose", value: "200", status: "alterado" }],
        findings: [
          { finding: "a", plainLanguage: "b", severity: "alterado" },
          { finding: "c", plainLanguage: "d", severity: "info" },
        ],
      })
    ).toBe(2);
  });
});

describe("countOutOfReference (B11: regra pela faixa do laudo)", () => {
  it("conta só valor numérico fora da faixa lida do laudo; limite é dentro", () => {
    expect(
      countOutOfReference([
        { value_num: 7.2, ref_min: null, ref_max: 5.7 }, // fora (acima)
        { value_num: 3, ref_min: 3.5, ref_max: 5 }, // fora (abaixo)
        { value_num: 5.7, ref_min: null, ref_max: 5.7 }, // no limite: dentro
        { value_num: "100", ref_min: "70", ref_max: "99" }, // numeric do PostgREST vem como texto
        { value_num: 9, ref_min: null, ref_max: null }, // sem faixa: não entra
        { value_num: null, ref_min: 1, ref_max: 2 }, // valor textual: não entra
      ])
    ).toBe(3);
  });
});