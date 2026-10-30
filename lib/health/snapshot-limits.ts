import type { UnifiedHealthSnapshot } from "@/lib/health/types";

/**
 * Limites da entrada de `/api/health/ingest` (GLYX-21 / P19).
 *
 * A rota grava direto na série que alimenta painel, resumo semanal e contexto
 * da IA, e aceitava qualquer coisa: dias sem limite, data no futuro, sono
 * negativo, dois milhões de passos. Os tetos abaixo não são metas de saúde —
 * são o que um dia real consegue medir. Fora disso é erro de quem enviou, e a
 * rota recusa em vez de gravar.
 */

/** Um ano e pouco de histórico por pedido — o maior export diário razoável. */
export const MAX_DAYS_PER_REQUEST = 400;

/** Corpo máximo em bytes. `metadata` é livre, e é ela que cresce sem controle. */
export const MAX_BODY_BYTES = 1_000_000;

type Campo = "steps" | "sleepHours" | "restingHr" | "activeCalories" | "stressScore";

export const FIELD_RANGE: Record<Campo, { min: number; max: number; label: string }> = {
  steps: { min: 0, max: 100_000, label: "passos" },
  sleepHours: { min: 0, max: 24, label: "horas de sono" },
  restingHr: { min: 20, max: 250, label: "frequência cardíaca de repouso" },
  activeCalories: { min: 0, max: 10_000, label: "calorias ativas" },
  stressScore: { min: 0, max: 100, label: "índice de estresse" },
};

const DIA_MS = 86_400_000;

export type SnapshotCheck =
  | { ok: true; snapshots: UnifiedHealthSnapshot[]; duplicadosIgnorados: number }
  | { ok: false; error: string };

/** Data `YYYY-MM-DD` que existe no calendário (`2026-02-30` não existe). */
function dataValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function checkHealthSnapshots(
  snapshots: UnifiedHealthSnapshot[],
  now: Date = new Date()
): SnapshotCheck {
  if (snapshots.length > MAX_DAYS_PER_REQUEST) {
    return { ok: false, error: `Máximo de ${MAX_DAYS_PER_REQUEST} dias por envio.` };
  }

  // Um dia de folga para o fuso: "hoje" em UTC-3 já é amanhã em UTC.
  const amanha = new Date(now.getTime() + DIA_MS).toISOString().slice(0, 10);

  // Mesmo dia e fonte duas vezes no envio quebra o upsert inteiro ("affect row
  // a second time"). Fica o último, que é a leitura mais nova do mesmo dia.
  const porChave = new Map<string, UnifiedHealthSnapshot>();
  for (const s of snapshots) {
    if (s.source === "mock") {
      return { ok: false, error: "Fonte 'mock' não é aceita: este endpoint grava na série real." };
    }
    if (!dataValida(s.snapshotDate)) {
      return { ok: false, error: `Data inválida: ${JSON.stringify(s.snapshotDate)} (use AAAA-MM-DD).` };
    }
    if (s.snapshotDate > amanha) {
      return { ok: false, error: `Data no futuro: ${s.snapshotDate}.` };
    }
    for (const campo of Object.keys(FIELD_RANGE) as Campo[]) {
      const v = s[campo];
      if (v == null) continue;
      const { min, max, label } = FIELD_RANGE[campo];
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
        return {
          ok: false,
          error: `${s.snapshotDate}: ${label} fora do possível (${JSON.stringify(v)}; aceito ${min}–${max}).`,
        };
      }
    }
    porChave.set(`${s.snapshotDate}|${s.source}`, s);
  }

  return {
    ok: true,
    snapshots: [...porChave.values()],
    duplicadosIgnorados: snapshots.length - porChave.size,
  };
}
