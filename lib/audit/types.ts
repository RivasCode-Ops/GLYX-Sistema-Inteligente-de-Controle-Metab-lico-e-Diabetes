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
  hyperCount: z.number().int(),
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
