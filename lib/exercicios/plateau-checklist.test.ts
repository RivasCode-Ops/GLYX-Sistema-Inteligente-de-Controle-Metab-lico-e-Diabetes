import { describe, expect, it } from "vitest";
import {
  causasProvaveis,
  montarChecklistDePlato,
  type EntradaDoChecklist,
} from "./plateau-checklist";

const BASE: EntradaDoChecklist = {
  proteinaPorKg: 1.9,
  alvoProteinaPorKg: 1.8,
  kcalMedia: 2600,
  kcalAlvo: 2500,
  sonoHoras: 7.5,
  adesao: 0.95,
  gruposEmRecuperacao: 2,
  gruposPausados: 0,
  gruposTotais: 12,
  volumeSetsPorSemana: 14,
  volumePiso: 10,
};

const ORDEM = [
  "alimentacao",
  "sono",
  "adesao",
  "recuperacao",
  "esforco",
  "execucao",
  "volume",
] as const;

describe("montarChecklistDePlato", () => {
  it("a ordem é fixa e volume é sempre o último", () => {
    expect(montarChecklistDePlato(BASE).map((i) => i.id)).toEqual([...ORDEM]);
  });

  it("volume continua por último mesmo quando é o único item ruim", () => {
    // O atalho que a lista existe para fechar: o único número ruim sobe ao topo
    // e vira a conclusão. A ordem não pode depender da gravidade.
    const itens = montarChecklistDePlato({ ...BASE, volumeSetsPorSemana: 4 });
    expect(itens[itens.length - 1].id).toBe("volume");
    expect(itens[itens.length - 1].estado).toBe("atencao");
    expect(causasProvaveis(itens).map((i) => i.id)).toEqual(["volume"]);
  });

  it("proteína abaixo do alvo aparece antes do volume", () => {
    const itens = montarChecklistDePlato({ ...BASE, proteinaPorKg: 1.0 });
    const causas = causasProvaveis(itens);
    expect(causas[0].id).toBe("alimentacao");
    expect(causas[0].detalhe).toContain("raramente se resolve somando série");
  });

  it("sem alimentação registrada diz sem_dado, não diz que está bem", () => {
    const itens = montarChecklistDePlato({
      ...BASE,
      proteinaPorKg: null,
      kcalMedia: null,
    });
    const alimentacao = itens.find((i) => i.id === "alimentacao")!;
    expect(alimentacao.estado).toBe("sem_dado");
    // "sem_dado" não pode entrar como causa provável: seria acusar sem medir.
    expect(causasProvaveis(itens).map((i) => i.id)).not.toContain("alimentacao");
  });

  it("sem integração de saúde, sono fica sem_dado em vez de sumir da lista", () => {
    const itens = montarChecklistDePlato({ ...BASE, sonoHoras: null });
    const sono = itens.find((i) => i.id === "sono")!;
    expect(sono.estado).toBe("sem_dado");
    expect(sono.detalhe).toContain("em vez de ser dado como resolvido");
  });

  it("sono curto entra como causa, antes de adesão e volume", () => {
    const itens = montarChecklistDePlato({ ...BASE, sonoHoras: 5.4 });
    expect(causasProvaveis(itens).map((i) => i.id)).toEqual(["sono"]);
  });

  it("adesão baixa declara que o denominador usa os horários de hoje", () => {
    const itens = montarChecklistDePlato({ ...BASE, adesao: 0.6 });
    const adesao = itens.find((i) => i.id === "adesao")!;
    expect(adesao.estado).toBe("atencao");
    expect(adesao.detalhe).toContain("distorce o denominador");
  });

  it("esforço e execução são sempre sem_dado enquanto não houver coluna", () => {
    const itens = montarChecklistDePlato(BASE);
    expect(itens.find((i) => i.id === "esforco")!.estado).toBe("sem_dado");
    expect(itens.find((i) => i.id === "execucao")!.estado).toBe("sem_dado");
  });

  it("com tudo em ordem, o volume dentro da faixa diz que é o último passo", () => {
    const itens = montarChecklistDePlato(BASE);
    expect(causasProvaveis(itens)).toHaveLength(0);
    expect(itens.find((i) => i.id === "volume")!.detalhe).toContain("último passo");
  });

  it("causas prováveis saem na ordem da lista, não por gravidade", () => {
    const itens = montarChecklistDePlato({
      ...BASE,
      volumeSetsPorSemana: 3,
      sonoHoras: 5,
      proteinaPorKg: 0.9,
    });
    expect(causasProvaveis(itens).map((i) => i.id)).toEqual(["alimentacao", "sono", "volume"]);
  });
});
