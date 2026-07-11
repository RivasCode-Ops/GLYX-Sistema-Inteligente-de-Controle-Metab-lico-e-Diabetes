import type { UnifiedCgmReading } from "@/lib/cgm/types";

/**
 * Formato genérico inspirado em leituras Libre (valor em mg/dL ou mmol/L).
 * mmol/L é convertido ×18 quando `unit` indica mmol.
 *
 * ```json
 * { "ValueInMgPerDl": 6.2, "Timestamp": "2026-01-09T12:00:00", "type": 0 }
 * ```
 */
export type LibreMeasurementLike = {
  ValueInMgPerDl?: number;
  Value?: number;
  /** mmol/L em alguns payloads */
  ValueInMmolPerL?: number;
  Timestamp?: string;
  timestamp?: string;
  FactoryTimestamp?: string;
  unit?: "mg/dL" | "mmol/L";
};

export function normalizeLibreMeasurements(rows: LibreMeasurementLike[]): UnifiedCgmReading[] {
  const out: UnifiedCgmReading[] = [];
  for (const row of rows) {
    const ts = row.Timestamp ?? row.timestamp ?? row.FactoryTimestamp;
    if (!ts) continue;

    let mg: number | null = null;
    if (row.ValueInMgPerDl != null) mg = Math.round(row.ValueInMgPerDl);
    else if (row.Value != null) mg = Math.round(row.Value);
    else if (row.ValueInMmolPerL != null)
      mg = Math.round(row.ValueInMmolPerL * 18);

    if (mg == null || mg <= 0 || mg >= 1000) continue;

    const iso = new Date(ts).toISOString();
    const externalId = `libre:${iso}:${mg}`;

    out.push({
      valueMgDl: mg,
      recordedAt: iso,
      source: "libre",
      externalId,
      trend: null,
      metadata: { raw: row },
    });
  }
  return out;
}
