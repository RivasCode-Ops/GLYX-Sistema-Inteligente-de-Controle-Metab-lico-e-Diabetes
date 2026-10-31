import { describe, expect, it } from "vitest";
import { clientePaginadoFalso } from "@/lib/queries/fake-paginated-client";
import { loadInsightDatasets } from "./datasets";

// Etapa 2, B7 e B12: séries do motor de correlações alinhadas pelo dia LOCAL,
// sem dado de demonstração.

describe("loadInsightDatasets", () => {
  const ontem = new Date(Date.now() - 86_400_000);
  // 22h em São Paulo (01h UTC do dia seguinte).
  const y = ontem.getUTCFullYear();
  const m = String(ontem.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ontem.getUTCDate()).padStart(2, "0");
  const diaLocal = `${y}-${m}-${d}`;
  const vintEDuasSP = new Date(`${diaLocal}T22:00:00-03:00`).toISOString();

  const { cliente } = clientePaginadoFalso({
    glucose_readings: [
      { id: "g1", user_id: "u1", value_mg_dl: 150, recorded_at: vintEDuasSP, source: "libre" },
      { id: "g2", user_id: "u1", value_mg_dl: 400, recorded_at: vintEDuasSP, source: "mock" },
    ],
    meals: [{ user_id: "u1", carbs_g: 60, eaten_at: vintEDuasSP }],
    exercise_sessions: [{ user_id: "u1", duration_min: 30, started_at: vintEDuasSP }],
    health_snapshots: [
      { user_id: "u1", snapshot_date: diaLocal, source: "mock", sleep_hours: 9, steps: 1 },
    ],
  });

  it("jantar das 22h cai no mesmo dia local da glicemia daquele horário", async () => {
    const r = await loadInsightDatasets(cliente, "u1", 3, "America/Sao_Paulo");
    expect([...r.byDayGlucose.keys()]).toEqual([diaLocal]);
    expect(r.byDayCarbs.get(diaLocal)).toBe(60);
    expect(r.byDayExercise.get(diaLocal)).toBe(30);
  });

  it("leitura e sono de demonstração não entram", async () => {
    const r = await loadInsightDatasets(cliente, "u1", 3, "America/Sao_Paulo");
    expect(r.byDayGlucose.get(diaLocal)?.avg).toBe(150);
    expect(r.byDaySleep.size).toBe(0);
  });
});
