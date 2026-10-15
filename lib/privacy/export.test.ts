import { describe, expect, it } from "vitest";
import { montarExportacao } from "./export";
import { clientePaginadoFalso, leituras } from "@/lib/queries/fake-paginated-client";

describe("exportação LGPD", () => {
  it("exporta as 2500 leituras, não as mil primeiras", async () => {
    const { cliente } = clientePaginadoFalso({
      profiles: [{ id: "u1", full_name: "Pessoa de Teste" }],
      glucose_readings: leituras(2500),
    });
    const out = await montarExportacao(cliente, "u1", "teste@example.invalid");
    expect(out.glucose_readings as unknown[]).toHaveLength(2500);
    expect(out.completo).toBe(true);
  });

  it("não mistura linhas de outro usuário", async () => {
    const { cliente } = clientePaginadoFalso({
      glucose_readings: [...leituras(3, "u1"), ...leituras(5, "u2")],
    });
    const out = await montarExportacao(cliente, "u1", null);
    expect(out.glucose_readings as unknown[]).toHaveLength(3);
  });

  it("falha de leitura marca o arquivo como incompleto, sem a mensagem do banco", async () => {
    const { cliente } = clientePaginadoFalso({ glucose_readings: leituras(2500) }, { falharNaPagina: 1 });
    const out = await montarExportacao(cliente, "u1", null);
    expect(out.completo).toBe(false);
    const incompletas = out.incompletas as { tabela: string; linhasExportadas: number; motivo: string }[];
    expect(incompletas.find((i) => i.tabela === "glucose_readings")).toEqual({
      tabela: "glucose_readings",
      linhasExportadas: 1000,
      motivo: "falha ao ler; arquivo parcial",
    });
    expect(JSON.stringify(out)).not.toContain("falha simulada");
  });

  it("credencial cifrada do sensor sai redigida", async () => {
    const { cliente } = clientePaginadoFalso({
      cgm_connections: [{ user_id: "u1", provider: "libre", credentials_enc: "segredo-cifrado" }],
    });
    const out = await montarExportacao(cliente, "u1", null);
    expect((out.cgm_connections as Record<string, unknown>[])[0].credentials_enc).toBe("[redacted]");
  });
});
