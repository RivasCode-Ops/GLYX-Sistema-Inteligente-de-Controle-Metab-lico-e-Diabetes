import { describe, expect, it } from "vitest";
import { parseExamValues, parseRefRange } from "./parse-values";

/** Trecho literal do laudo Cendomed de 24/06/2026, como está no banco. */
const LAUDO = `Laboratório Cendomed — coleta 24/06/2026 — solicitante Dr. Manoel Aderson Soares Filho (CRM 3829-PI)

GLICEMIA E METABÓLICO
Hemoglobina glicada (HbA1c): 12,3 % [VR normal <5,7 | bom controle <7]
Glicose média estimada: 306,0 mg/dL
Glicose de jejum: 247 mg/dL [VR 70-99]
Peptídeo C: 1,60 ng/mL [VR 0,8-4,2]
Anticorpo anti-GAD: <5 UI/mL [negativo <10]

LIPÍDIOS
Colesterol total: 197 mg/dL [VR <190]
HDL: 24 mg/dL [VR >40]
LDL: 139 mg/dL [meta anotada pelo médico: <70]
VLDL: 34 mg/dL
Triglicérides: 203 mg/dL [VR <150]

RENAL
Creatinina: 0,82 mg/dL [VR 0,60-1,30]
eGFR (CKD-EPI): >90 mL/min/1,73m2
Microalbuminúria: 72,00 mg/g de creatinina [VR <26,0]

SUMARIO DE URINA (EAS)
Proteinas: + | Glicose: + | Corpos cetonicos: +
Impressao: exame compativel com a normalidade.`;

describe("parseExamValues sobre o laudo real", () => {
  const vals = parseExamValues(LAUDO);
  const por = (slug: string) => vals.find((v) => v.analyte === slug);

  it("extrai o valor, a unidade e a referência da HbA1c", () => {
    const v = por("hba1c")!;
    expect(v.valueNum).toBe(12.3);
    expect(v.unit).toBe("%");
    expect(v.refText).toContain("bom controle <7");
    expect(v.label).toBe("Hemoglobina glicada (HbA1c)");
  });

  it("faixa numérica vira min e max; limite único não vira faixa", () => {
    expect(por("glicemia_jejum")).toMatchObject({ valueNum: 247, refMin: 70, refMax: 99 });
    // "<190" é um limite só. Inventar o outro lado faria o app afirmar um
    // intervalo que o laudo não escreveu.
    expect(por("colesterol_total")).toMatchObject({ refMin: null, refMax: null });
    expect(por("colesterol_total")!.refText).toBe("VR <190");
  });

  it("comparador é preservado como texto, nunca virado número", () => {
    // "<5" não é 5: gravar 5 diria que o exame mediu o que ele declarou não medir.
    expect(por("anti_gad")).toMatchObject({ valueNum: null, valueText: "<5", unit: "UI/mL" });
    expect(por("egfr")).toMatchObject({ valueNum: null, valueText: ">90" });
  });

  it("vírgula decimal é lida como decimal", () => {
    expect(por("peptideo_c")!.valueNum).toBe(1.6);
    expect(por("creatinina")!.valueNum).toBe(0.82);
    expect(por("microalbuminuria")!.valueNum).toBe(72);
  });

  it("LDL e VLDL saem separados", () => {
    expect(por("ldl")!.valueNum).toBe(139);
    expect(por("vldl")!.valueNum).toBe(34);
    // A meta anotada à mão é preservada como veio, e NÃO vira faixa numérica.
    expect(por("ldl")!.refText).toContain("<70");
    expect(por("ldl")!.refMin).toBeNull();
  });

  it("cabeçalho de seção e prosa não viram analito", () => {
    const nomes = vals.map((v) => v.label.toUpperCase());
    expect(nomes).not.toContain("GLICEMIA E METABÓLICO");
    expect(nomes).not.toContain("LIPÍDIOS");
    expect(nomes).not.toContain("RENAL");
    expect(vals.some((v) => /impressao/i.test(v.label))).toBe(false);
  });

  it("guarda o que o vocabulário não reconhece, com o rótulo do laudo", () => {
    // Perder um valor porque a grafia não estava prevista é pior que não ter
    // série dele.
    const proteinas = vals.find((v) => /proteinas/i.test(v.label));
    expect(proteinas).toBeDefined();
    expect(proteinas!.analyte).toBeNull();
    expect(proteinas!.valueText).toBeTruthy();
  });

  it("cada linha carrega o texto original para conferência", () => {
    expect(por("hba1c")!.source).toContain("12,3");
  });

  it("não repete analito", () => {
    const slugs = vals.map((v) => v.analyte).filter(Boolean);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("parseRefRange", () => {
  it("lê as formas de faixa que aparecem em laudo", () => {
    expect(parseRefRange("VR 70-99")).toEqual({ min: 70, max: 99 });
    expect(parseRefRange("VR 0,8-4,2")).toEqual({ min: 0.8, max: 4.2 });
    expect(parseRefRange("VR 210 a 980")).toEqual({ min: 210, max: 980 });
  });

  it("recusa o que não é faixa", () => {
    expect(parseRefRange("VR <190")).toEqual({ min: null, max: null });
    expect(parseRefRange("negativo <10")).toEqual({ min: null, max: null });
    expect(parseRefRange("")).toEqual({ min: null, max: null });
    // Invertida é erro de leitura, não faixa.
    expect(parseRefRange("99-70")).toEqual({ min: null, max: null });
  });
});
