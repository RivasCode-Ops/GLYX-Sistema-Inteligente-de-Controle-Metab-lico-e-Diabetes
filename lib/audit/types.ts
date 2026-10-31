import { z } from "zod";

export const auditSeveritySchema = z.enum(["info", "warning", "critical"]);
export type AuditSeverity = z.infer<typeof auditSeveritySchema>;

export const auditLabelSchema = z.enum(["Estável", "Atenção", "Alerta", "Dados insuficientes"]);
export type AuditLabel = z.infer<typeof auditLabelSchema>;

export const auditFactorSchema = z.object({
  id: z.string(),
  label: z.string(),
  severity: auditSeveritySchema,
  weight: z.number(),
  evidence: z.string(),
  scoreImpact: z.number(),
});
export type AuditFactor = z.infer<typeof auditFactorSchema>;

export const auditPlanItemSchema = z.object({
  priority: z.number().int(),
  title: z.string(),
  why: z.string(),
  href: z.string(),
  actionLabel: z.string(),
});
export type AuditPlanItem = z.infer<typeof auditPlanItemSchema>;

export const auditMetricsSchema = z.object({
  windowDays: z.number().int(),
  readingCount: z.number().int(),
  daysWithGlucose: z.number().int(),
  tirPercent: z.number().nullable(),
  hypoCount: z.number().int(),
  /** Leituras acima da META do usuário (base do TIR) — não é hiper severa. */
  hyperCount: z.number().int(),
  /** Leituras >= 250 mg/dL. Opcional: auditorias gravadas antes de 26/07/2026 não têm. */
  severeHyperCount: z.number().int().optional(),
  /**
   * Episódios (consenso de CGM: ≥ 15 min fora, encerra com 15 min dentro).
   * Opcionais: auditorias gravadas antes de 30/10/2026 só têm contagem de leitura.
   */
  hypoEpisodes: z.number().int().optional(),
  hyperEpisodes: z.number().int().optional(),
  /** Leituras fora sem vizinha a ≤ 30 min (glicosímetro): eventos que não formam episódio. */
  hypoIsoladas: z.number().int().optional(),
  hyperIsoladas: z.number().int().optional(),
  /** CV amostral em %, uma casa — mesma fórmula do painel. */
  cvPercent: z.number().nullable().optional(),
  avgGlucose: z.number().nullable(),
  stdDev: z.number().nullable(),
  avgCarbsPerDay: z.number().nullable(),
  spikeMealCount: z.number().int(),
  activeDays: z.number().int(),
  avgExerciseMin: z.number().nullable(),
  avgSleepHours: z.number().nullable(),
  lowSleepDays: z.number().int(),
  waterDays: z.number().int(),
  medLogCount: z.number().int(),
  insulinDoseCount: z.number().int(),
  weightDeltaKg: z.number().nullable(),
  examAlteredCount: z.number().int(),
});
export type AuditMetrics = z.infer<typeof auditMetricsSchema>;

export type MetabolicAuditReport = {
  score: number;
  label: AuditLabel;
  metrics: AuditMetrics;
  factors: AuditFactor[];
  plan: AuditPlanItem[];
  periodStart: string;
  periodEnd: string;
  windowDays: number;
};

export type MetabolicAuditRow = {
  id: string;
  user_id: string;
  window_days: number;
  period_start: string;
  period_end: string;
  score: number;
  label: AuditLabel;
  metrics: AuditMetrics;
  factors: AuditFactor[];
  plan: AuditPlanItem[];
  computed_at: string;
};
