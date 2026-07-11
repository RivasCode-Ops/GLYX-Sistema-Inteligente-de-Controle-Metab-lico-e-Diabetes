import type { UnifiedCgmReading } from "@/lib/cgm/types";

/** Gera série sintética para desenvolvimento — não representa paciente real */
export function generateMockCgmSeries(points: number, intervalMinutes = 5): UnifiedCgmReading[] {
  const now = Date.now();
  const out: UnifiedCgmReading[] = [];
  let value = 110 + Math.random() * 20;

  for (let i = points - 1; i >= 0; i--) {
    const t = now - i * intervalMinutes * 60 * 1000;
    value += (Math.random() - 0.48) * 8;
    value = Math.max(65, Math.min(240, value));
    const mg = Math.round(value);
    const iso = new Date(t).toISOString();
    out.push({
      valueMgDl: mg,
      recordedAt: iso,
      source: "mock",
      externalId: `mock:${iso}:${mg}`,
      trend: Math.random() > 0.7 ? "Flat" : null,
      metadata: { synthetic: true },
    });
  }
  return out;
}
