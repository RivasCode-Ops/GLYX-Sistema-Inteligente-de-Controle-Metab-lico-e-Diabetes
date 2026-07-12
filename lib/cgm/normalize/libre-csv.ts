import type { UnifiedCgmReading } from "@/lib/cgm/types";

/**
 * Parser do CSV exportado pelo LibreView (nuvem do FreeStyle Libre /
 * LibreLink). Suporta o export em português e em inglês.
 *
 * Estrutura do arquivo:
 *   linha 1: metadados ("Glucose Data,Generated on ..." / "Dados de glicose,...")
 *   linha 2: cabeçalhos — localizados por nome, não por posição
 *   demais: uma leitura por linha
 *
 * Tipos de registro usados: 0 = histórico (a cada 15 min), 1 = escaneada.
 * Timestamp local do aparelho no formato DD-MM-YYYY HH:MM (pt) ou
 * MM-DD-YYYY hh:mm AM/PM (en) — detectado pela presença de AM/PM.
 */

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseLibreTimestamp(raw: string): string | null {
  const s = raw.trim();
  // en: MM-DD-YYYY hh:mm AM/PM
  const en = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (en) {
    let h = Number(en[4]) % 12;
    if (/pm/i.test(en[6])) h += 12;
    const d = new Date(Number(en[3]), Number(en[1]) - 1, Number(en[2]), h, Number(en[5]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  // pt/eu: DD-MM-YYYY HH:MM
  const pt = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (pt) {
    const d = new Date(Number(pt[3]), Number(pt[2]) - 1, Number(pt[1]), Number(pt[4]), Number(pt[5]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

export type LibreCsvParseResult = {
  readings: UnifiedCgmReading[];
  skipped: number;
};

export function parseLibreViewCsv(text: string): LibreCsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // Localiza a linha de cabeçalho pelo campo de tipo de registro
  const headerIdx = lines.findIndex(
    (l) => /record type/i.test(l) || /tipo de registro/i.test(l)
  );
  if (headerIdx < 0) return { readings: [], skipped: 0 };

  const headers = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const col = {
    timestamp: headers.findIndex((h) => /device timestamp|carimbo de data/.test(h)),
    type: headers.findIndex((h) => /record type|tipo de registro/.test(h)),
    historic: headers.findIndex(
      (h) => /(historic glucose|histórico de glicose|historico de glicose)/.test(h)
    ),
    scan: headers.findIndex(
      (h) => /(scan glucose|leitura de glicose|glicose escaneada)/.test(h)
    ),
  };
  if (col.timestamp < 0 || col.type < 0 || (col.historic < 0 && col.scan < 0)) {
    return { readings: [], skipped: 0 };
  }

  const isMmol = headers.some((h) => /mmol/.test(h));
  const readings: UnifiedCgmReading[] = [];
  let skipped = 0;

  for (const line of lines.slice(headerIdx + 1)) {
    const cells = splitCsvLine(line);
    const type = cells[col.type];
    if (type !== "0" && type !== "1") continue; // outros tipos: insulina, notas…

    const rawValue =
      type === "0" ? cells[col.historic] ?? "" : cells[col.scan] ?? cells[col.historic] ?? "";
    const value = Number.parseFloat(rawValue.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      skipped++;
      continue;
    }
    const mg = Math.round(isMmol ? value * 18 : value);
    if (mg <= 0 || mg >= 1000) {
      skipped++;
      continue;
    }

    const iso = parseLibreTimestamp(cells[col.timestamp] ?? "");
    if (!iso) {
      skipped++;
      continue;
    }

    readings.push({
      valueMgDl: mg,
      recordedAt: iso,
      source: "libre",
      externalId: `libre:${iso}:${mg}`,
      trend: null,
      metadata: { recordType: type },
    });
  }

  return { readings, skipped };
}
