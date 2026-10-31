import { describe, expect, it } from "vitest";
import { JANELA_ALERTA_NAO_LIDO_H, somenteNaoLidos } from "./unread";

// Etapa 2, B16: uma regra de "não lido" para sino e painel.

describe("somenteNaoLidos", () => {
  it("aplica read_at nulo e a janela de 48 h", () => {
    const chamadas: [string, string, unknown][] = [];
    const q = {
      is(c: string, v: null) {
        chamadas.push(["is", c, v]);
        return q;
      },
      gte(c: string, v: string) {
        chamadas.push(["gte", c, v]);
        return q;
      },
    };
    const agora = new Date("2026-10-30T12:00:00Z");
    somenteNaoLidos(q, agora);
    expect(chamadas).toEqual([
      ["is", "read_at", null],
      ["gte", "created_at", new Date(agora.getTime() - JANELA_ALERTA_NAO_LIDO_H * 3600_000).toISOString()],
    ]);
  });
});