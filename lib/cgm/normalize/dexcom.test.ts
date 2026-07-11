import { describe, expect, it } from "vitest";
import { normalizeDexcomEgvs } from "@/lib/cgm/normalize/dexcom";

describe("normalizeDexcomEgvs", () => {
  it("ignora linhas incompletas", () => {
    expect(normalizeDexcomEgvs([{}])).toEqual([]);
  });

  it("normaliza valor e tendência", () => {
    const out = normalizeDexcomEgvs([
      {
        systemTime: "2026-01-09T12:00:00.000Z",
        value: 112,
        trendArrow: "Flat",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].valueMgDl).toBe(112);
    expect(out[0].source).toBe("dexcom");
    expect(out[0].trend).toBe("Flat");
    expect(out[0].recordedAt).toMatch(/2026-01-09/);
  });
});
