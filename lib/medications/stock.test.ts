import { describe, expect, it } from "vitest";
import { stockLabel, stockState } from "./stock";

const AGORA = new Date("2026-09-08T12:00:00Z");

function diasAtras(n: number): string {
  return new Date(AGORA.getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

describe("stockState", () => {
  it("sem unidades ou sem data não afirma nada", () => {
    expect(stockState({ stock_units: null, stock_updated_on: diasAtras(1) }, AGORA).kind).toBe(
      "sem_dado"
    );
    expect(stockState({ stock_units: 30, stock_updated_on: null }, AGORA).kind).toBe("sem_dado");
    expect(stockLabel({ kind: "sem_dado" }, false)).toBeNull();
  });

  it("com informação recente, estima os dias restantes", () => {
    const s = stockState(
      { stock_units: 30, stock_updated_on: diasAtras(5), reminder_times: ["08:00"] },
      AGORA
    );
    expect(s).toEqual({ kind: "estimado", daysLeft: 25, low: false });
  });

  it("divide pelas doses do dia, não pelo número de comprimidos", () => {
    // 150 unidades, 3 doses/dia, informado há 10 dias: consumiu 30, restam 120,
    // que são 40 dias.
    const s = stockState(
      { stock_units: 150, stock_updated_on: diasAtras(10), reminder_times: ["08:00", "13:00", "19:00"] },
      AGORA
    );
    expect(s).toEqual({ kind: "estimado", daysLeft: 40, low: false });
  });

  it("marca estoque baixo, que é quando o aviso serve", () => {
    const s = stockState({ stock_units: 10, stock_updated_on: diasAtras(4) }, AGORA);
    expect(s).toEqual({ kind: "estimado", daysLeft: 6, low: true });
  });

  it("projeção esgotada NÃO vira 'seu estoque acabou'", () => {
    // O caso real: Berberina, 30 unidades informadas em 18/07, uma dose por dia.
    const s = stockState({ stock_units: 30, stock_updated_on: diasAtras(52) }, AGORA);
    expect(s).toEqual({ kind: "informacao_vencida", daysSinceUpdate: 52 });

    const texto = stockLabel(s, true)!;
    // O app não sabe se acabou — sabe que a informação venceu. A frase precisa
    // dizer a segunda coisa, não a primeira.
    expect(texto).toContain("informado há 52 dias");
    expect(texto).toContain("Atualize");
    expect(texto).not.toMatch(/acabou\b/);
  });

  it("data futura não produz consumo negativo", () => {
    const s = stockState(
      { stock_units: 10, stock_updated_on: new Date(AGORA.getTime() + 86_400_000).toISOString().slice(0, 10) },
      AGORA
    );
    expect(s).toEqual({ kind: "estimado", daysLeft: 10, low: false });
  });

  it("ícone acompanha o tipo do item", () => {
    const s = stockState({ stock_units: 30, stock_updated_on: diasAtras(1) }, AGORA);
    expect(stockLabel(s, true)).toContain("🥄");
    expect(stockLabel(s, false)).toContain("💊");
  });
});
