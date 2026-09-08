import { describe, expect, it } from "vitest";
import { classifyGlucose, TOP_OF_RANGE_FRACTION } from "./glucose-thresholds";

const FAIXA = { targetMin: 70, targetMax: 180 };

describe("classifyGlucose", () => {
  it("o caso da contradição: 147 em 70–180", () => {
    // O painel dizia "Moderado" e a tela de Glicemia dizia "dentro da meta"
    // sobre este mesmo número, na mesma hora.
    const c = classifyGlucose(147, FAIXA);
    expect(c.zone).toBe("topo_da_meta");
    expect(c.inRange).toBe(true);
    // O rótulo NÃO pode negar o pertencimento à faixa — é o que "Moderado"
    // fazia, soando como veredito de risco.
    expect(c.label).toContain("meta");
  });

  it("dentro da faixa, longe do teto", () => {
    const c = classifyGlucose(100, FAIXA);
    expect(c.zone).toBe("na_meta");
    expect(c.inRange).toBe(true);
  });

  it("fora da faixa nos dois lados", () => {
    expect(classifyGlucose(65, FAIXA)).toMatchObject({ zone: "abaixo", inRange: false });
    expect(classifyGlucose(200, FAIXA)).toMatchObject({ zone: "acima", inRange: false });
  });

  it("as fronteiras não deixam buraco nem sobreposição", () => {
    // Mínimo pertence à faixa; máximo NÃO — mesma convenção do resto do app,
    // onde `>= targetMax` já era "Atenção".
    expect(classifyGlucose(70, FAIXA).inRange).toBe(true);
    expect(classifyGlucose(180, FAIXA).inRange).toBe(false);
    expect(classifyGlucose(179, FAIXA).inRange).toBe(true);
  });

  it("o topo acompanha a faixa do usuário, e não um número fixo", () => {
    // Faixa apertada (80–140): o topo cai em 80 + 0,65×60 = 119.
    const apertada = { targetMin: 80, targetMax: 140 };
    expect(classifyGlucose(118, apertada).zone).toBe("na_meta");
    expect(classifyGlucose(119, apertada).zone).toBe("topo_da_meta");
    // O ponto: a MESMA leitura muda de zona conforme a faixa do usuário.
    // 130 está no topo da faixa apertada e no meio da larga.
    expect(classifyGlucose(130, apertada).zone).toBe("topo_da_meta");
    expect(classifyGlucose(130, FAIXA).zone).toBe("na_meta");
    // E só sai da faixa acima do máximo dela.
    expect(classifyGlucose(145, apertada).zone).toBe("acima");
  });

  it("a fração do topo é a mesma que o painel já usava", () => {
    expect(TOP_OF_RANGE_FRACTION).toBe(0.65);
  });

  it("faixa degenerada não quebra a classificação", () => {
    const zero = { targetMin: 100, targetMax: 100 };
    expect(classifyGlucose(100, zero).inRange).toBe(false);
    expect(classifyGlucose(99, zero).zone).toBe("abaixo");
  });
});
