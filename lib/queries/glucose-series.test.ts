import { describe, expect, it } from "vitest";
import { aggregateGlucoseByDay, type GlucosePoint } from "@/lib/queries/glucose-series";

describe("aggregateGlucoseByDay", () => {
  it("agrupa por dia e calcula média, min e máx", () => {
    const readings: GlucosePoint[] = [
      { id: "a", value_mg_dl: 100, recorded_at: "2026-01-01T10:00:00.000Z" },
      { id: "b", value_mg_dl: 120, recorded_at: "2026-01-01T18:00:00.000Z" },
      { id: "c", value_mg_dl: 90, recorded_at: "2026-01-02T08:00:00.000Z" },
    ];
    const agg = aggregateGlucoseByDay(readings);
    expect(agg).toHaveLength(2);
    const d1 = agg.find((x) => x.day === "2026-01-01");
    expect(d1?.avg).toBe(110);
    expect(d1?.min).toBe(100);
    expect(d1?.max).toBe(120);
    expect(d1?.count).toBe(2);
  });

  it("lista vazia", () => {
    expect(aggregateGlucoseByDay([])).toEqual([]);
  });
});
