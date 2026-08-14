import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, titleFrom, toChronological } from "./ai-threads";

describe("titleFrom", () => {
  it("usa a pergunta inteira quando ela é curta", () => {
    expect(titleFrom("Por que minha glicemia sobe à tarde?")).toBe(
      "Por que minha glicemia sobe à tarde?"
    );
  });

  it("corta pergunta longa mantendo o começo, que é o que identifica", () => {
    const longa = "a".repeat(100);
    const titulo = titleFrom(longa);

    expect(titulo).toHaveLength(58); // 57 + reticências
    expect(titulo.endsWith("…")).toBe(true);
  });

  it("normaliza espaço e quebra de linha", () => {
    expect(titleFrom("  revisar   meu\n  dia  ")).toBe("revisar meu dia");
  });
});

describe("toChronological", () => {
  it("inverte a ordem decrescente do banco para ordem de leitura", () => {
    const doBanco = [
      { role: "assistant", content: "terceira" },
      { role: "user", content: "segunda" },
      { role: "assistant", content: "primeira" },
    ];

    expect(toChronological(doBanco).map((m) => m.content)).toEqual([
      "primeira",
      "segunda",
      "terceira",
    ]);
  });

  it("descarta papel que não é de conversa", () => {
    // `system` cabe no CHECK da tabela, mas não é mensagem que o usuário
    // escreveu nem leu — devolvê-la ao chat mostraria prompt interno na tela.
    const doBanco = [
      { role: "user", content: "oi" },
      { role: "system", content: "instrução interna" },
    ];

    expect(toChronological(doBanco)).toEqual([{ role: "user", content: "oi" }]);
  });

  it("aguenta histórico vazio", () => {
    expect(toChronological([])).toEqual([]);
  });
});

describe("HISTORY_LIMIT", () => {
  it("cabe na conversa que a rota de chat aceita", () => {
    // A rota recusa acima de 30 mensagens. Restaurar 30 faria a primeira
    // pergunta depois de reabrir já nascer rejeitada — o limite tem que deixar
    // folga para a conversa continuar.
    expect(HISTORY_LIMIT).toBeLessThan(30);
  });
});
