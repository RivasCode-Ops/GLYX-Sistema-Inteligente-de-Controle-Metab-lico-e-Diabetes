import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnifiedCgmReading } from "@/lib/cgm/types";

export type IngestResult = { inserted: number; skipped: number; error?: string };

/** Insere leituras CGM normalizadas; dedup por (user_id, source, external_id) quando external_id existe */
export async function ingestUnifiedReadings(
  supabase: SupabaseClient,
  userId: string,
  readings: UnifiedCgmReading[]
): Promise<IngestResult> {
  if (readings.length === 0) return { inserted: 0, skipped: 0 };

  const withExt = readings.filter((r) => r.externalId != null);
  const externalIds = [...new Set(withExt.map((r) => r.externalId as string))];

  const existing = new Set<string>();
  if (externalIds.length > 0) {
    const sources = [...new Set(withExt.map((r) => r.source))];
    const { data } = await supabase
      .from("glucose_readings")
      .select("source, external_id")
      .eq("user_id", userId)
      .in("source", sources)
      .in("external_id", externalIds);

    for (const row of data ?? []) {
      if (row.external_id)
        existing.add(`${row.source}:${row.external_id}`);
    }
  }

  let inserted = 0;
  let skipped = 0;

  const rows: Record<string, unknown>[] = [];

  for (const r of readings) {
    const key = r.externalId ? `${r.source}:${r.externalId}` : null;
    if (key && existing.has(key)) {
      skipped++;
      continue;
    }
    if (key) existing.add(key);

    rows.push({
      user_id: userId,
      value_mg_dl: r.valueMgDl,
      recorded_at: r.recordedAt,
      source: r.source,
      context: null,
      notes: null,
      external_id: r.externalId,
      trend: r.trend,
      metadata: r.metadata,
    });
  }

  if (rows.length === 0) return { inserted: 0, skipped };

  const { error } = await supabase.from("glucose_readings").insert(rows);

  if (error) {
    /** Se índice único falhou (corrida), tentar uma a uma */
    if (error.code === "23505") {
      let ins = 0;
      let skip = 0;
      for (const row of rows) {
        const { error: e2 } = await supabase.from("glucose_readings").insert(row);
        if (e2?.code === "23505") skip++;
        else if (!e2) ins++;
      }
      return { inserted: ins, skipped: skipped + skip };
    }
    return { inserted: 0, skipped, error: error.message };
  }

  inserted = rows.length;
  return { inserted, skipped };
}
