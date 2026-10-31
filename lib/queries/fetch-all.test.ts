import { describe, expect, it } from "vitest";
import { fetchAllRows, fetchAllRowsDetalhado } from "./fetch-all";
import { clientePaginadoFalso, leituras } from "./fake-paginated-client";

describe("leitura paginada além do teto de 1000", () => {
  it("traz as 2500 linhas, não as mil primeiras", async () => {
    const { cliente, chamadas } = clientePaginadoFalso({ glucose_readings: leituras(2500) });
    const r = await fetchAllRowsDetalhado(cliente, "glucose_readings", "*", "u1", { orderColumn: "recorded_at" });
    expect(r.rows).toHaveLength(2500);
    expect(r.completo).toBe(true);
    expect(chamadas).toHaveLength(3);
  });

  it("erro no meio vira resultado declaradamente incompleto", async () => {
    const { cliente } = clientePaginadoFalso({ glucose_readings: leituras(2500) }, { falharNaPagina: 1 });
    const r = await fetchAllRowsDetalhado(cliente, "glucose_readings", "*", "u1", { orderColumn: "recorded_at" });
    expect(r.rows).toHaveLength(1000);
    expect(r.completo).toBe(false);
    expect(r.erro).toBe("falha simulada");
  });

  it("múltiplo exato de 1000 termina com uma página vazia, sem laço infinito", async () => {
    const { cliente } = clientePaginadoFalso({ glucose_readings: leituras(2000) });
    const r = await fetchAllRowsDetalhado(cliente, "glucose_readings", "*", "u1", { orderColumn: "id" });
    expect(r.rows).toHaveLength(2000);
    expect(r.completo).toBe(true);
  });

  it("a versão antiga continua devolvendo só as linhas", async () => {
    const { cliente } = clientePaginadoFalso({ glucose_readings: leituras(1500) });
    const rows = await fetchAllRows(cliente, "glucose_readings", "*", "u1", { orderColumn: "recorded_at" });
    expect(rows).toHaveLength(1500);
  });

  it("demonstração fica fora por padrão; linha sem fonte continua (B12)", async () => {
    const base = leituras(4);
    base[0].source = "mock";
    base[1].source = "libre";
    base[2].source = null;
    const { cliente } = clientePaginadoFalso({ glucose_readings: base, meals: [{ ...base[0] }] });
    const rows = await fetchAllRows<{ id: string }>(cliente, "glucose_readings", "*", "u1", {
      orderColumn: "id",
    });
    expect(rows.map((r) => r.id)).toEqual([base[1].id, base[2].id, base[3].id]);
    const tudo = await fetchAllRows(cliente, "glucose_readings", "*", "u1", {
      orderColumn: "id",
      incluirDemonstracao: true,
    });
    expect(tudo).toHaveLength(4);
    // Tabela sem coluna de fonte de demonstração não recebe o filtro.
    expect(await fetchAllRows(cliente, "meals", "*", "u1", { orderColumn: "id" })).toHaveLength(1);
  });

  it("o cliente falso imita o teto: consulta sem range recebe só mil", async () => {
    const { cliente } = clientePaginadoFalso({ glucose_readings: leituras(2500) });
    const { data } = await cliente.from("glucose_readings").select("*").eq("user_id", "u1");
    expect(data).toHaveLength(1000);
  });
});
