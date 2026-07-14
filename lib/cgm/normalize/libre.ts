import type { UnifiedCgmReading } from "@/lib/cgm/types";
import { wallClockToUTC } from "@/lib/time/local-day";

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

// A LibreLinkUp devolve "M/D/YYYY h:mm:ss AM/PM" sem indicação de fuso —
// é o horário de parede do sensor/app do paciente. `new Date(string)` para
// esse formato usa o fuso do processo Node (ambiente), então o mesmo código
// dá resultados diferentes rodando localmente (fuso da máquina) vs. na
// Vercel (UTC por padrão). Por isso parseamos os componentes manualmente e
// convertemos explicitamente usando o fuso do perfil do usuário.
const US_DATETIME_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i;

function parseLibreTimestamp(ts: string, timezone: string | null | undefined): Date | null {
  const m = US_DATETIME_RE.exec(ts.trim());
  if (!m) {
    // Formato inesperado (ex.: já ISO com fuso) — usar o parser nativo é
    // seguro nesse caso, já que uma string ISO com "Z"/offset é inequívoca.
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, monthStr, dayStr, yearStr, hourStr, minStr, secStr, ampm] = m;
  let hour = Number(hourStr);
  if (ampm) {
    hour = hour % 12; // 12 AM/PM vira 0 antes de somar o turno
    if (ampm.toUpperCase() === "PM") hour += 12;
  }
  return wallClockToUTC(
    Number(yearStr),
    Number(monthStr),
    Number(dayStr),
    hour,
    Number(minStr),
    Number(secStr),
    timezone
  );
}

export function normalizeLibreMeasurements(
  rows: LibreMeasurementLike[],
  timezone?: string | null
): UnifiedCgmReading[] {
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

    const parsedDate = parseLibreTimestamp(ts, timezone);
    if (!parsedDate) continue;
    const iso = parsedDate.toISOString();
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
