import { describe, expect, it } from "vitest";
import { ANALYTES, normalizeAnalyteName, resolveAnalyte } from "./analytes";

describe("resolveAnalyte", () => {
  it("resolve as grafias que aparecem no laudo real do usuário", () => {
    expect(resolveAnalyte("Hemoglobina glicada (HbA1c)")?.slug).toBe("hba1c");
    expect(resolveAnalyte("HbA1c")?.slug).toBe("hba1c");
    expect(resolveAnalyte("Glicose de jejum")?.slug).toBe("glicemia_jejum");
    expect(resolveAnalyte("Microalbuminúria")?.slug).toBe("microalbuminuria");
    expect(resolveAnalyte("TSH ultrassensivel")?.slug).toBe("tsh");
    expect(resolveAnalyte("Vitamina D 25-OH")?.slug).toBe("vitamina_d");
  });

  it("laboratórios diferentes chegam no mesmo slug — que é o ponto da série", () => {
    const grafias = [
      "Hemoglobina glicada",
      "Hemoglobina Glicosilada A1c",
      "Glico-hemoglobina",
      "HbA1c",
    ];
    const slugs = new Set(grafias.map((g) => resolveAnalyte(g)?.slug));
    expect(slugs).toEqual(new Set(["hba1c"]));
  });

  it("LDL não casa dentro de VLDL", () => {
    // Substring simples faria "vldl" resolver para `ldl`, e as duas séries
    // virariam uma só.
    expect(resolveAnalyte("VLDL")?.slug).toBe("vldl");
    expect(resolveAnalyte("LDL")?.slug).toBe("ldl");
    expect(resolveAnalyte("Colesterol VLDL")?.slug).toBe("vldl");
    expect(resolveAnalyte("Colesterol LDL")?.slug).toBe("ldl");
  });

  it("prefere o alias mais longo quando dois casam", () => {
    // "colesterol" e "colesterol total" ambos aparecem; ganha o específico.
    expect(resolveAnalyte("Colesterol total")?.slug).toBe("colesterol_total");
    expect(resolveAnalyte("Colesterol HDL")?.slug).toBe("hdl");
  });

  it("acento e pontuação não decidem nada", () => {
    expect(resolveAnalyte("TRIGLICÉRIDES")?.slug).toBe("triglicerides");
    expect(resolveAnalyte("triglicerideos")?.slug).toBe("triglicerides");
    expect(resolveAnalyte("  Ferritina:  ")?.slug).toBe("ferritina");
  });

  it("não reconhecido devolve null, e quem chama guarda mesmo assim", () => {
    // Null é sinal para gravar com o label do laudo — perder o valor porque o
    // vocabulário não previu a grafia seria pior que não ter série dele.
    expect(resolveAnalyte("Homocisteína")).toBeNull();
    expect(resolveAnalyte("")).toBeNull();
    expect(resolveAnalyte("   ")).toBeNull();
  });

  it("todo alias é ponto fixo do normalizador", () => {
    // Alias que não sobrevive à própria normalização nunca casaria com nada —
    // o mesmo defeito que 'vitamina d3' teve na base de substâncias.
    for (const a of ANALYTES) {
      for (const alias of a.aliases) {
        expect(normalizeAnalyteName(alias), `alias "${alias}" de ${a.slug}`).toBe(alias);
      }
      expect(normalizeAnalyteName(a.slug.replace(/_/g, " "))).toBeTruthy();
    }
  });

  it("nenhum slug repetido e nenhum alias em dois analitos", () => {
    const slugs = ANALYTES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    const vistos = new Map<string, string>();
    for (const a of ANALYTES) {
      for (const alias of a.aliases) {
        const dono = vistos.get(alias);
        expect(dono, `alias "${alias}" em ${a.slug} e ${dono}`).toBeUndefined();
        vistos.set(alias, a.slug);
      }
    }
  });
});
