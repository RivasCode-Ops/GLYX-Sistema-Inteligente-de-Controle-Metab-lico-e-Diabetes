/**
 * Inventário LGPD das tabelas com dados do usuário.
 * Manter alinhado às migrations — ao criar tabela nova com user_id, incluir aqui.
 */

/** Ordem de DELETE respeitando FKs (filhos antes dos pais). */
export const USER_DATA_DELETE_ORDER = [
  "medication_snoozes",
  "medication_logs",
  "medications",
  "ai_threads", // cascateia ai_messages
  "glucose_readings",
  "meals",
  "water_logs",
  "weight_logs",
  "exercise_sessions",
  "strength_logs",
  "muscle_pauses",
  "metabolic_alerts",
  "exams",
  "health_snapshots",
  "insight_findings",
  "metabolic_audits",
  "insulin_logs",
  "ai_usage",
  "push_dispatch_log",
  "push_subscriptions",
  "cgm_connections",
  "google_fit_connections",
] as const;

/** Tabelas incluídas no export JSON (profiles usa coluna id). */
export const USER_DATA_EXPORT_TABLES = [
  "profiles",
  "glucose_readings",
  "meals",
  "water_logs",
  "weight_logs",
  "medications",
  "medication_logs",
  "medication_snoozes",
  "exercise_sessions",
  "strength_logs",
  "muscle_pauses",
  "metabolic_alerts",
  "exams",
  "health_snapshots",
  "insight_findings",
  "metabolic_audits",
  "insulin_logs",
  "ai_threads",
  "ai_messages",
  "ai_usage",
  "push_subscriptions",
  "push_dispatch_log",
  "cgm_connections",
  "google_fit_connections",
] as const;

export const PRIVATE_PHOTO_BUCKETS = ["meal-photos", "medication-labels"] as const;

/** Colunas sensíveis removidas do export (nunca saem no JSON do usuário). */
export const EXPORT_REDACT_COLUMNS: Record<string, readonly string[]> = {
  cgm_connections: ["credentials_enc"],
  google_fit_connections: ["tokens_enc"],
};
