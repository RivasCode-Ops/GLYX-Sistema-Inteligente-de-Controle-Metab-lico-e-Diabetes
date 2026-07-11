import { describe, expect, it } from "vitest";
import { normalizeGoogleFitDaily } from "@/lib/health/google-fit";

describe("normalizeGoogleFitDaily", () => {
  it("mapeia campos alternativos", () => {
    const out = normalizeGoogleFitDaily([
      {
        date: "2026-01-09",
        steps: 8000,
        sleep_hours: 7.5,
        resting_hr: 60,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].snapshotDate).toBe("2026-01-09");
    expect(out[0].steps).toBe(8000);
    expect(out[0].sleepHours).toBe(7.5);
    expect(out[0].restingHr).toBe(60);
    expect(out[0].source).toBe("google_fit");
  });
});
