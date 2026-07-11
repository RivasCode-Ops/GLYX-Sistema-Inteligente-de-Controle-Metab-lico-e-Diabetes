import type { UnifiedHealthSnapshot } from "@/lib/health/types";

/** Últimos N dias com valores plausíveis — apenas desenvolvimento */
export function generateMockHealthSnapshots(days: number): UnifiedHealthSnapshot[] {
  const out: UnifiedHealthSnapshot[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      snapshotDate: iso,
      source: "mock",
      steps: Math.round(4000 + Math.random() * 6000),
      sleepHours: Math.round((5.5 + Math.random() * 2.5) * 10) / 10,
      restingHr: Math.round(58 + Math.random() * 18),
      activeCalories: Math.round(200 + Math.random() * 400),
      stressScore: Math.round(20 + Math.random() * 60),
      metadata: { synthetic: true },
    });
  }
  return out;
}
