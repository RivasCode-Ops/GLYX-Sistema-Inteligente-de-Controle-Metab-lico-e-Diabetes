import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAuditDayGrid } from "@/lib/audit/day-grid";
import { computeAuditMetrics } from "@/lib/audit/metrics";
import { scoreFromMetrics } from "@/lib/audit/score";
import type { MetabolicAuditReport, MetabolicAuditRow } from "@/lib/audit/types";

/**
 * A leitura do período veio incompleta. A auditoria NÃO é calculada: o score
 * é gravado e vai para o relatório do médico e para o contexto da IA, e um
 * score sobre parte da janela é um número plausível e errado.
 */
export class AuditoriaIncompletaError extends Error {
  constructor(public readonly tabelas: string[]) {
    super(`Leitura incompleta: ${tabelas.join(", ")}`);
    this.name = "AuditoriaIncompletaError";
  }
}

export const MENSAGEM_AUDITORIA_INCOMPLETA =
  "Não consegui ler todos os registros do período, então a auditoria não foi calculada nem gravada. Tente de novo em instantes.";

export async function runMetabolicAudit(
  supabase: SupabaseClient,
  userId: string,
  windowDays: number = 14
): Promise<MetabolicAuditReport> {
  const clamped = Math.min(90, Math.max(7, Math.round(windowDays)));
  const { inputs, periodStart, periodEnd, incompletas } = await loadAuditDayGrid(supabase, userId, clamped);
  if (incompletas.length) throw new AuditoriaIncompletaError(incompletas);
  const metrics = computeAuditMetrics(inputs);
  return scoreFromMetrics(metrics, periodStart, periodEnd);
}

export async function persistMetabolicAudit(
  supabase: SupabaseClient,
  userId: string,
  report: MetabolicAuditReport
): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await supabase
    .from("metabolic_audits")
    .insert({
      user_id: userId,
      window_days: report.windowDays,
      period_start: report.periodStart,
      period_end: report.periodEnd,
      score: report.score,
      label: report.label,
      metrics: report.metrics,
      factors: report.factors,
      plan: report.plan,
      computed_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) return { id: null, error: error.message };
  return { id: (data as { id: string } | null)?.id ?? null };
}

export async function listMetabolicAudits(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 10
): Promise<MetabolicAuditRow[]> {
  const { data, error } = await supabase
    .from("metabolic_audits")
    .select("*")
    .eq("user_id", userId)
    .order("computed_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as MetabolicAuditRow[];
}
