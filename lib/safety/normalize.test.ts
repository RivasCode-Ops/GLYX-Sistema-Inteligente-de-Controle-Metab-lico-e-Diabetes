import { describe, expect, it } from "vitest";
import { containsAlias, normalizeSubstanceText } from "./normalize";

describe("normalizeSubstanceText", () => {
  it("tira marca, dose e unidade de nome de insulina", () => {
    expect(normalizeSubstanceText("Lantus SoloStar 100 UI/mL")).toBe("lantus solostar");
  });

  it("tira acento e dose de suplemento", () => {
    expect(normalizeSubstanceText("Ácido Alfa-Lipóico 600mg")).toBe("acido alfa lipoico");
  });

  it("colapsa apresentações diferentes do mesmo medicamento", () => {
    expect(normalizeSubstanceText("Metformina 850 mg")).toBe(
      normalizeSubstanceText("Metformina 500mg")
    );
  });

  it("devolve vazio para texto sem nenhuma letra", () => {
    expect(normalizeSubstanceText("500 mg")).toBe("");
    expect(normalizeSubstanceText("   ")).toBe("");
  });
});

describe("containsAlias", () => {
  it("casa palavra inteira", () => {
    expect(containsAlias("berberina cloridrato", "berberina")).toBe(true);
    expect(containsAlias("cloridrato de berberina", "berberina")).toBe(true);
  });

  it("não casa como pedaço de outra palavra", () => {
    expect(containsAlias("berberinax", "berberina")).toBe(false);
    expect(containsAlias("xberberina", "berberina")).toBe(false);
  });

  /**
   * Regressão do falso negativo mais caro deste arquivo: parar na primeira
   * ocorrência faria o match colado num sufixo esconder a ocorrência real logo
   * adiante — alerta grave cadastrado na base e nunca disparado.
   */
  it("continua procurando depois de uma ocorrência colada", () => {
    expect(containsAlias("berberinax berberina", "berberina")).toBe(true);
  });

  it("alias vazio nunca casa", () => {
    expect(containsAlias("qualquer coisa", "")).toBe(false);
  });
});
