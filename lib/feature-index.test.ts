import { describe, expect, it } from "vitest";
import {
  FEATURES,
  featureIndexForPrompt,
  formatWhere,
  searchFeatures,
} from "./feature-index";

/** Títulos dos resultados, na ordem em que a busca os devolveu. */
function titulos(query: string): string[] {
  return searchFeatures(query).map((m) => m.feature.title);
}

describe("searchFeatures", () => {
  it("acha o catálogo de exercícios — a pergunta que originou a lupa", () => {
    expect(titulos("catálogo")).toContain("Catálogo de exercícios");
  });

  it("acha por sinônimo que não aparece em nenhum título", () => {
    // Ninguém procura por "Catálogo de exercícios" quando o que quer saber é se
    // o supino está lá.
    expect(titulos("supino")).toContain("Catálogo de exercícios");
    expect(titulos("levar pro médico")).toContain("Resumo da semana");
    expect(titulos("lgpd")).toContain("Exportar ou apagar meus dados");
  });

  it("ignora acento e caixa", () => {
    expect(titulos("CATALOGO")).toContain("Catálogo de exercícios");
    expect(titulos("catalogo")).toContain("Catálogo de exercícios");
    expect(titulos("glicemia")).toEqual(titulos("GLICÊMIA"));
  });

  it("põe o casamento por título antes do casamento por sinônimo", () => {
    const resultado = titulos("carga");
    expect(resultado[0]).toBe("Progressão de carga");
    expect(resultado).toContain("Catálogo de exercícios");
  });

  it("acha pelo módulo, para quem lembra do lugar e não do nome", () => {
    expect(titulos("composição").length).toBeGreaterThan(1);
  });

  it("não responde a busca curta demais", () => {
    // Uma letra casaria com quase tudo e a lista viraria ruído.
    expect(searchFeatures("c")).toEqual([]);
    expect(searchFeatures("")).toEqual([]);
  });

  it("devolve vazio para o que não existe, em vez de resultado plausível", () => {
    expect(searchFeatures("receita de bolo de chocolate")).toEqual([]);
  });
});

describe("integridade do índice", () => {
  it("toda função tem destino, caminho e explicação", () => {
    for (const feature of FEATURES) {
      expect(feature.href.startsWith("/"), `${feature.title}: href inválido`).toBe(true);
      expect(feature.where.length, `${feature.title}: sem caminho`).toBeGreaterThan(0);
      expect(feature.what.length, `${feature.title}: sem explicação`).toBeGreaterThan(10);
    }
  });

  it("não repete título", () => {
    const titles = FEATURES.map((f) => f.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("formata o caminho com separador legível", () => {
    const catalogo = FEATURES.find((f) => f.title === "Catálogo de exercícios")!;
    expect(formatWhere(catalogo)).toBe("Exercícios › Recuperação › Progressão de carga");
  });
});

describe("featureIndexForPrompt", () => {
  it("leva toda função para o contexto da IA, com caminho e rota", () => {
    const prompt = featureIndexForPrompt();

    for (const feature of FEATURES) {
      expect(prompt).toContain(feature.title);
      expect(prompt).toContain(feature.href);
    }
  });

  it("instrui a não inventar tela fora da lista", () => {
    expect(featureIndexForPrompt().toLowerCase()).toContain("não invente");
  });
});
