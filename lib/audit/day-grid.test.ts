import { describe, expect, it } from "vitest";
import { loadAuditDayGrid } from "./day-grid";
import { AuditoriaIncompletaError, runMetabolicAudit } from "./run";
import { loadWeeklySummary } from "@/lib/queries/weekly-summary";
import { clientePaginadoFalso, leituras } from "@/lib/queries/fake-paginated-client";

/** 2500 leituras nas últimas ~42 h — dentro de qualquer janela de 7 a 90 dias. */
const recentes = () => leituras(2500, "u1", Date.now() - 2 * 86_400_000);
const PERFIL = [{ id: "u1", timezone: "America/Sao_Paulo", target_glucose_min: 70, target_glucose_max: 180 }];

describe("auditoria metabólica além do teto de 1000", () => {
  it("usa todas as leituras da janela, não as mil mais antigas", async () => {
    const { cliente } = clientePaginadoFalso({ profiles: PERFIL, glucose_readings: recentes() });
    const r = await loadAuditDayGrid(cliente, "u1", 14);
    expect(r.inputs.glucose).toHaveLength(2500);
    expect(r.incompletas).toEqual([]);
  });

  it("leitura incompleta impede o cálculo — nada de score sobre parte da janela", async () => {
    const { cliente } = clientePaginadoFalso(
      { profiles: PERFIL, glucose_readings: recentes() },
      { falharNaPagina: 1 }
    );
    await expect(runMetabolicAudit(cliente, "u1", 14)).rejects.toBeInstanceOf(AuditoriaIncompletaError);
  });
});

describe("resumo semanal além do teto de 1000", () => {
  it("conta todas as leituras da semana", async () => {
    const { cliente } = clientePaginadoFalso({ profiles: PERFIL, glucose_readings: recentes() });
    const r = await loadWeeklySummary(cliente, "u1");
    expect(r.metrics.readingCount).toBe(2500);
  });

  it("leitura incompleta vira erro, não número", async () => {
    const { cliente } = clientePaginadoFalso(
      { profiles: PERFIL, glucose_readings: recentes() },
      { falharNaPagina: 1 }
    );
    await expect(loadWeeklySummary(cliente, "u1")).rejects.toThrow(/incompleta/);
  });
});
