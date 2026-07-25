import { parsedExamSummarySchema } from "@/lib/exams/types";
import type { ExamValueStatus } from "@/lib/exams/types";

export type ExamValuePoint = {
  date: string;
  value: number;
  status: ExamValueStatus;
  raw: string;
};

export type ExamParameterSeries = {
  parameter: string;
  unit: string | null;
  referenceRange: string | null;
  points: ExamValuePoint[];
};

function parseNumericValue(raw: string): number | null {
  const m = raw.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseUnit(raw: string): string | null {
  const m = raw.match(/-?\d+(?:[.,]\d+)?\s*(.*)$/);
  const unit = m?.[1]?.trim();
  return unit ? unit : null;
}

/** Extrai [min, max] de um texto de faixa de referência tipo "70-100 mg/dL". */
export function parseReferenceRange(range: string | null | undefined): [number, number] | null {
  if (!range) return null;
  // Lookbehind evita ler o hífen de "70-100" como sinal de negativo (viraria
  // [-100, 70] em vez de [70, 100]) — só é sinal quando não precedido por dígito.
  const nums = range.replace(",", ".").match(/(?<!\d)-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const [a, b] = nums.map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a <= b ? [a, b] : [b, a];
}

/**
 * Agrupa os valores de vários exames laboratoriais pelo nome do parâmetro
 * (normalizado por texto, já que laudos diferentes escrevem o mesmo exame
 * com grafias levemente diferentes) numa série cronológica por parâmetro.
 * Só entram parâmetros com pelo menos 2 pontos — com um só não há
 * "evolução" pra mostrar.
 */
export function buildExamParameterSeries(
  exams: { created_at: string; parsed_summary: unknown }[]
): ExamParameterSeries[] {
  const byKey = new Map<string, ExamParameterSeries>();
  const sorted = [...exams].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  for (const exam of sorted) {
    const parsed = parsedExamSummarySchema.safeParse(exam.parsed_summary);
    if (!parsed.success) continue;

    for (const v of parsed.data.values ?? []) {
      const num = parseNumericValue(v.value);
      if (num == null) continue;

      const key = v.parameter.trim().toLowerCase();
      const entry = byKey.get(key) ?? {
        parameter: v.parameter.trim(),
        unit: parseUnit(v.value),
        referenceRange: v.referenceRange ?? null,
        points: [],
      };
      entry.referenceRange = v.referenceRange ?? entry.referenceRange;
      entry.points.push({ date: exam.created_at, value: num, status: v.status, raw: v.value });
      byKey.set(key, entry);
    }
  }

  return [...byKey.values()].filter((s) => s.points.length >= 2);
}
