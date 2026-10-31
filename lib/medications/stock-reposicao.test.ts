import { describe, expect, it } from "vitest";
import { MAX_UNIDADES_ESTOQUE, stockState, totalAposReposicao, unidadesRestantes } from "./stock";

// Reposição de estoque a partir do aviso (estoque-repor, 31/10/2026).

const AGORA = new Date("2026-09-08T12:00:00Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString().slice(0, 10);

describe("reposição de estoque", () => {
  const diario = { stock_units: 30, stock_updated_on: diasAtras(10), reminder_times: ["08:00", "20:00"] };

  it("o que resta segue a mesma conta do aviso (2 por dia × 10 dias)", () => {
    expect(unidadesRestantes(diario, AGORA)).toBe(10);
  });

  it("'comprei mais' soma ao que resta; 'contei' grava o total", () => {
    expect(totalAposReposicao(diario, "somar", 60, AGORA)).toBe(70);
    expect(totalAposReposicao(diario, "total", 45, AGORA)).toBe(45);
  });

  it("estoque vencido pela conta não fica negativo: a compra vira o total", () => {
    const vencido = { stock_units: 10, stock_updated_on: diasAtras(52), reminder_times: ["08:00"] };
    expect(stockState(vencido, AGORA).kind).toBe("informacao_vencida");
    expect(unidadesRestantes(vencido, AGORA)).toBe(0);
    expect(totalAposReposicao(vencido, "somar", 30, AGORA)).toBe(30);
  });

  it("semanal: só dia de dose consome", () => {
    // AGORA é terça; atualizado na segunda com 4, a dose de terça consumiu 1.
    const semanal = { stock_units: 4, stock_updated_on: diasAtras(1), reminder_times: ["08:00"], cadence: "semanal", cadence_weekday: 2 };
    expect(unidadesRestantes(semanal, AGORA)).toBe(3);
  });

  it("sem estoque anterior, 'comprei mais' vira o total; teto respeitado", () => {
    expect(unidadesRestantes({ stock_units: null, stock_updated_on: null }, AGORA)).toBeNull();
    expect(totalAposReposicao({ stock_units: null, stock_updated_on: null }, "somar", 20, AGORA)).toBe(20);
    expect(totalAposReposicao(diario, "somar", MAX_UNIDADES_ESTOQUE, AGORA)).toBe(MAX_UNIDADES_ESTOQUE);
  });
});