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

  it("interpreta o timestamp 'M/D/YYYY h:mm:ss AM/PM' da LibreLinkUp no fuso do perfil, não no fuso do processo", () => {
    // 14/07/2026 21:45:00 em São Paulo (UTC-3) = 15/07 00:45:00 UTC.
    const out = normalizeLibreMeasurements(
      [{ Timestamp: "7/14/2026 9:45:00 PM", ValueInMgPerDl: 95 }],
      "America/Sao_Paulo"
    );
    expect(out).toHaveLength(1);
    expect(out[0].recordedAt).toBe("2026-07-15T00:45:00.000Z");
  });

  it("meia-noite (12 AM) e meio-dia (12 PM) no formato americano", () => {
    const out = normalizeLibreMeasurements(
      [
        { Timestamp: "7/14/2026 12:00:00 AM", ValueInMgPerDl: 90 },
        { Timestamp: "7/14/2026 12:00:00 PM", ValueInMgPerDl: 100 },
      ],
      "America/Sao_Paulo"
    );
    expect(out[0].recordedAt).toBe("2026-07-14T03:00:00.000Z");
    expect(out[1].recordedAt).toBe("2026-07-14T15:00:00.000Z");
  });
});
