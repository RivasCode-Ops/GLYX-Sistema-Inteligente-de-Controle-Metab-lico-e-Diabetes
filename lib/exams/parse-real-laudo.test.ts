import { describe, expect, it } from "vitest";
import { parseExamValues } from "./parse-values";

/**
 * Cobertura contra o laudo REAL, como está gravado no banco em 08/09/2026.
 *
 * Este teste existe para medir, e não só para passar: um parser de laudo se
 * julga pelo que ele extrai do documento de verdade, não do exemplo que quem
 * escreveu o parser inventou. Se a cobertura cair, é porque o formato mudou ou
 * o vocabulário encolheu — e nos dois casos alguém precisa olhar.
 */
const CENDOMED = `Laboratório Cendomed — coleta 24/06/2026 — solicitante Dr. Manoel Aderson Soares Filho (CRM 3829-PI)

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
Não-HDL: 173 mg/dL
Triglicérides: 203 mg/dL [VR <150]

RENAL
Creatinina: 0,82 mg/dL [VR 0,60-1,30]
eGFR (CKD-EPI): >90 mL/min/1,73m2
Ureia: 30,4 mg/dL [VR 15-40]
Microalbuminúria: 72,00 mg/g de creatinina [VR <26,0]

HEPÁTICO E MUSCULAR
TGO: 21,1 U/L [VR homens <37]
TGP: 24,8 U/mL [VR homens ate 40]
CPK: 80,0 U/L [VR homens <195]

VITAMINAS E FERRO
Vitamina D 25-OH: 25,5 ng/mL [>20 desejavel geral | 30-60 grupos de risco]
Vitamina B12: 489,37 pg/mL [VR 210-980]
Ferritina: 630 ug/L [VR homens 30-300 | excesso de ferro >400]

HORMONAL
TSH ultrassensivel: 2,46 uUI/mL [VR 0,45-4,50]
T4 livre: 0,97 ng/dL [VR 0,70-1,80]
Testosterona total: 342,30 ng/dL [VR homens 50+ : 120-895]
FSH: 6,42 mUI/mL [VR homens 2,0-12,8]
LH: 4,14 mUI/mL [VR homens 20-70a: 1,5-9,3]
Prolactina: 2,00 ng/mL [VR homens 4,08-18,42]

SUMARIO DE URINA (EAS)
Proteinas: + | Glicose: + | Corpos cetonicos: +`;

describe("cobertura no laudo real do usuário", () => {
  const vals = parseExamValues(CENDOMED);
  const slugs = new Set(vals.map((v) => v.analyte).filter(Boolean));

  it("extrai os analitos que mais importam no acompanhamento dele", () => {
    // HbA1c e LDL são os dois que o conselho analítico apontou como o
    // cruzamento mais forte com o sensor e com o hipolipemiante novo.
    for (const esperado of [
      "hba1c",
      "glicemia_jejum",
      "ldl",
      "hdl",
      "triglicerides",
      "creatinina",
      "microalbuminuria",
      "ferritina",
      "tsh",
      "vitamina_d",
      "peptideo_c",
    ]) {
      expect(slugs, `faltou ${esperado}`).toContain(esperado);
    }
  });

  it("cobre a maior parte das linhas de resultado", () => {
    // 27 linhas com "nome: valor" no laudo, mais três do sumário de urina.
    expect(vals.length).toBeGreaterThanOrEqual(28);
    // E a maioria com slug canônico, que é o que permite série.
    expect(slugs.size / vals.length).toBeGreaterThan(0.75);
  });

  it("os valores conferem com o papel", () => {
    const por = (s: string) => vals.find((v) => v.analyte === s)!;
    expect(por("hba1c").valueNum).toBe(12.3);
    expect(por("ldl").valueNum).toBe(139);
    expect(por("hdl").valueNum).toBe(24);
    expect(por("triglicerides").valueNum).toBe(203);
    expect(por("microalbuminuria").valueNum).toBe(72);
    expect(por("ferritina").valueNum).toBe(630);
    expect(por("prolactina").valueNum).toBe(2);
  });

  it("não inventa resultado a partir de cabeçalho", () => {
    for (const cabecalho of ["GLICEMIA E METABÓLICO", "LIPÍDIOS", "RENAL", "HORMONAL"]) {
      expect(vals.some((v) => v.label === cabecalho)).toBe(false);
    }
  });
});
