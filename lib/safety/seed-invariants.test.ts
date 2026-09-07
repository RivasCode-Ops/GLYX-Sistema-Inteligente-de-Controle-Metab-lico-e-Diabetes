import { describe, expect, it } from "vitest";
import { seedAliases, seedInteractions, severityCheckVocabulary } from "./__fixtures__/read-seed";
import { normalizeSubstanceText } from "./normalize";
import { orderPair } from "./interaction-check";

/**
 * Invariantes do seed. São o que uma lista clínica escrita à mão erra, e cada
 * um dos erros abaixo falha em silêncio em produção: a linha existe na base, a
 * consulta não a encontra, e o app se comporta como se a interação não
 * existisse.
 */

const ALIASES = seedAliases();
const INTERACTIONS = seedInteractions();

describe("substance_aliases", () => {
  it("o seed foi lido", () => {
    expect(ALIASES.length).toBeGreaterThan(50);
  });

  /**
   * O invariante que sustenta a comparação de um lado só. Um alias com acento
   * ou dígito ('vitamina d3', 'omega 3') nunca casaria com o texto normalizado
   * — e o app diria "não conheço essa substância" sobre algo cadastrado.
   */
  it("todo alias é ponto fixo do normalizador", () => {
    for (const { canonical, alias } of ALIASES) {
      expect(normalizeSubstanceText(alias), `alias de ${canonical}`).toBe(alias);
    }
  });

  it("não há par (canonical, alias) repetido", () => {
    const chaves = ALIASES.map((a) => `${a.canonical}|${a.alias}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("o alias de associação mapeia para mais de um canônico", () => {
    const glyxambi = ALIASES.filter((a) => a.alias === "glyxambi").map((a) => a.canonical);
    expect(glyxambi.sort()).toEqual(["inibidor_dpp4", "inibidor_sglt2"]);
  });
});

describe("substance_interactions", () => {
  it("o seed foi lido", () => {
    expect(INTERACTIONS.length).toBeGreaterThan(15);
  });

  it("toda linha satisfaz substance_a < substance_b", () => {
    for (const i of INTERACTIONS) {
      expect(orderPair(i.substanceA, i.substanceB), `${i.substanceA} x ${i.substanceB}`).toEqual([
        i.substanceA,
        i.substanceB,
      ]);
    }
  });

  /**
   * O CHECK do Postgres usa `collate "C"`; o TypeScript compara por code point.
   * Se um seed futuro tiver um par onde a pontuação muda a ordem — que é o que
   * uma collation linguística faria com `_` — as duas divergem, e o par é
   * gravado numa ordem e consultado na outra.
   */
  it("a ordenação não depende de pontuação ser ignorada", () => {
    const semPontuacao = (s: string) => s.replace(/[^a-z0-9]/g, "");
    for (const i of INTERACTIONS) {
      expect(
        semPontuacao(i.substanceA) < semPontuacao(i.substanceB),
        `${i.substanceA} x ${i.substanceB} muda de ordem sem pontuação`
      ).toBe(true);
    }
  });

  it("não há par repetido", () => {
    const chaves = INTERACTIONS.map((i) => `${i.substanceA}|${i.substanceB}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("todo slug citado tem ao menos um alias", () => {
    const comAlias = new Set(ALIASES.map((a) => a.canonical));
    for (const i of INTERACTIONS) {
      expect(comAlias.has(i.substanceA), `${i.substanceA} sem alias`).toBe(true);
      expect(comAlias.has(i.substanceB), `${i.substanceB} sem alias`).toBe(true);
    }
  });

  it("toda severity pertence ao CHECK do Postgres", () => {
    const vocabulario = severityCheckVocabulary();
    expect(vocabulario.sort()).toEqual(["grave", "leve", "moderada"]);
    for (const i of INTERACTIONS) {
      expect(vocabulario).toContain(i.severity);
    }
  });

  it("mecanismo e mensagem nunca são vazios", () => {
    for (const i of INTERACTIONS) {
      expect(i.mechanism.trim().length, `${i.substanceA} x ${i.substanceB}`).toBeGreaterThan(0);
      expect(i.message.trim().length, `${i.substanceA} x ${i.substanceB}`).toBeGreaterThan(0);
    }
  });

  /**
   * As duas substâncias que existem só para o checador conseguir dizer
   * "conheço e não achei nada". Se alguém cadastrar uma interação para elas, a
   * distinção deixa de ser testável por este seed e o teste avisa.
   */
  it("vitamina_d3 e omega3 seguem sem interação cadastrada", () => {
    const citados = new Set(INTERACTIONS.flatMap((i) => [i.substanceA, i.substanceB]));
    expect(citados.has("vitamina_d3")).toBe(false);
    expect(citados.has("omega3")).toBe(false);
  });
});
