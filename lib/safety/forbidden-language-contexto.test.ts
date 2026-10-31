import { describe, expect, it } from "vitest";
import { findForbiddenLanguage } from "./forbidden-language";

// Correção de 31/10/2026: negação e objeto inofensivo não derrubam a resposta;
// a afirmação continua barrada.

const passa = [
  "A berberina não é segura junto com a insulina sem acompanhamento médico.",
  "O app não tem essa substância na base: isso não significa que está sem risco.",
  "Não dá para afirmar que é a causa; leve à consulta.",
  "Você pode manter a caminhada depois do almoço.",
  "Sua glicemia vai bem: 7 de 10 leituras na meta.",
  "Nunca é seguro mudar a dose sozinho.",
];

const barra = [
  "Pode tomar, é seguro.",
  "Sem risco nenhum com a sua medicação.",
  "Você pode manter o remédio como está.",
  "Isso está causando os picos.",
  "Sua glicemia vai cair para 60 às 15h.",
  "A glicemia estará em 200 depois do jantar.",
  // Uma negada não esconde a afirmada na mesma resposta.
  "Não é seguro sozinho, mas com o médico é seguro.",
];

describe("filtro de linguagem: negação e contexto", () => {
  it.each(passa)("passa: %s", (t) => expect(findForbiddenLanguage(t)).toEqual([]));
  it.each(barra)("barra: %s", (t) => expect(findForbiddenLanguage(t).length).toBeGreaterThan(0));
});