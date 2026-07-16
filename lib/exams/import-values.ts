// Detecta, entre os valores extraídos de um exame, os que podem ser
// aproveitados em outros registros do app (peso → registro de peso; glicose
// de jejum → histórico de glicemia). O usuário sempre confirma antes de
// salvar — nada é importado automaticamente.

export type ExamValueLike = {
  parameter: string;
  value: string;
};

export type ImportableValue =
  | { kind: "weight"; label: string; weightKg: number }
  | { kind: "glucose_jejum"; label: string; mgDl: number };

function parseNumber(value: string): number | null {
  const m = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function extractImportableValues(values: ExamValueLike[]): ImportableValue[] {
  const out: ImportableValue[] = [];

  for (const v of values) {
    const param = v.parameter.toLowerCase();

    if (/\bpeso\b/.test(param) && !/molecular/.test(param)) {
      const kg = parseNumber(v.value);
      if (kg != null && kg > 20 && kg < 400) {
        out.push({ kind: "weight", label: `${v.parameter}: ${v.value}`, weightKg: kg });
        continue;
      }
    }

    if (/glicose|glicemia/.test(param) && /jejum/.test(param)) {
      const mgDl = parseNumber(v.value);
      if (mgDl != null && mgDl >= 20 && mgDl <= 600) {
        out.push({ kind: "glucose_jejum", label: `${v.parameter}: ${v.value}`, mgDl });
      }
    }
  }

  return out;
}
