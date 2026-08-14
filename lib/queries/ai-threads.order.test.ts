import { describe, expect, it } from "vitest";
import { toChronological } from "./ai-threads";

/**
 * A regressão que estes testes fixam: pergunta e resposta são gravadas na mesma
 * transação e saem com `created_at` idêntico ao microssegundo, porque `now()`
 * no Postgres é o instante da TRANSAÇÃO. Ordenar por tempo empatava e a
 * conversa restaurada mostrava a resposta antes da pergunta — sempre, não às
 * vezes. A leitura passou a ordenar por `seq`.
 */
describe("ordem restaurada da conversa", () => {
  it("mantém pergunta antes de resposta quando a consulta devolve por seq decrescente", () => {
    // Como a consulta entrega: seq desc, limitado às últimas N.
    const doBanco = [
      { role: "assistant", content: "resposta" },
      { role: "user", content: "pergunta" },
    ];

    expect(toChronological(doBanco).map((m) => m.content)).toEqual(["pergunta", "resposta"]);
  });

  it("preserva a ordem de vários turnos", () => {
    const doBanco = [
      { role: "assistant", content: "r2" },
      { role: "user", content: "p2" },
      { role: "assistant", content: "r1" },
      { role: "user", content: "p1" },
    ];

    expect(toChronological(doBanco).map((m) => m.content)).toEqual(["p1", "r1", "p2", "r2"]);
  });
});
