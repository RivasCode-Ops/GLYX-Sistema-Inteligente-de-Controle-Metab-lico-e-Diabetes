import type { UnifiedCgmReading } from "@/lib/cgm/types";

/**
 * Formato simplificado inspirado em egvs do Dexcom (mg/dL).
 * Referência pública: valores e timestamps variam por produto/região — ajustar quando integrar API oficial.
 *
 * Esperado por entrada:
 * ```json
 * { "systemTime": "2026-01-09T12:00:00", "value": 120, "trendArrow": "Flat" }
 * ```
 */
export type DexcomEgvsLike = {
  systemTime?: string;
  displayTime?: string;
  value?: number;
  trendArrow?: string;
  trend?: string;
};

export function normalizeDexcomEgvs(rows: DexcomEgvsLike[]): UnifiedCgmReading[] {
  const out: UnifiedCgmReading[] = [];
  for (const row of rows) {
    const ts = row.systemTime ?? row.displayTime;
    const v = row.value;
    if (!ts || v == null || Number.isNaN(v)) continue;
    const mg = Math.round(v);
    if (mg <= 0 || mg >= 1000) continue;

    const iso = normalizeDexcomTimestamp(ts);
    const externalId = `dexcom:${iso}:${mg}`;

    out.push({
      valueMgDl: mg,
      recordedAt: iso,
      source: "dexcom",
      externalId,
      trend: row.trendArrow ?? row.trend ?? null,
      metadata: { raw: row },
    });
  }
  return out;
}

function normalizeDexcomTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}
