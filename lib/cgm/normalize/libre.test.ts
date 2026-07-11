import { describe, expect, it } from "vitest";
import { normalizeLibreMeasurements } from "@/lib/cgm/normalize/libre";

describe("normalizeLibreMeasurements", () => {
  it("converte mmol para mg/dL quando aplicável", () => {
    const out = normalizeLibreMeasurements([
      {
        Timestamp: "2026-01-09T12:00:00.000Z",
        ValueInMmolPerL: 6,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].valueMgDl).toBe(108);
    expect(out[0].source).toBe("libre");
  });
});
