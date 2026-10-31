/**
 * Inventário LGPD das tabelas com dados do usuário.
 *
 * Manter alinhado às migrations. Não depende mais de memória: o teste
 * `rls-coverage.test.ts` extrai do SQL toda tabela com `user_id` e reprova se
 * ela não estiver aqui (ou na lista de exceções declaradas, com o motivo). Até
 * 14/10/2026 o teste comparava esta lista com outra lista escrita à mão, e
 * quatro tabelas criadas em setembro ficaram de fora da exclusão sem ninguém ver.
 */

/** Ordem de DELETE respeitando FKs (filhos antes dos pais). */
export const USER_DATA_DELETE_ORDER = [
  "medication_snoozes",
  "medication_logs",
  "health_events", // medication_id on delete set null; apagado antes por clareza
  "medications",
  "ai_threads", // cascateia ai_messages
  "glucose_readings",
  "meals",
  "water_logs",
  "weight_logs",
  "exercise_sessions",
  "strength_logs",
  "muscle_pauses",
  "blood_pressure_logs",
  "body_measurements",
  "body_goals",
  "body_photos",
  "metabolic_alerts",
  "exams", // cascateia exam_values
  "health_snapshots",
  "insight_findings",
  "metabolic_audits",
  "insulin_logs",
  "hypo_events",
  "hypo_plan",
  "user_substance_windows",
  "push_dispatch_log",
  "push_subscriptions",
  "cgm_connections",
  "google_fit_connections",
] as const;

/**
 * `ai_usage` NÃO está no DELETE comum: desde GLYX-24 o usuário não apaga
 * linhas dela pela API (era o furo que zerava o limite de uso de IA a qualquer
 * momento). Na exclusão LGPD o servidor apaga o histórico INTEIRO com a chave
 * de serviço, só dentro de "apagar todos os meus dados" (decisão D4, aprovada
 * em 15/10/2026). Consequência aceita: a exclusão completa reinicia a cota
 * individual de uso por hora.
 */
export const AI_USAGE_APAGADA_PELO_SERVIDOR = "ai_usage" as const;

/** Tabelas que saem apagadas por cascata do pai, sem DELETE próprio. */
export const USER_DATA_CASCADE: Record<string, string> = {
  ai_messages: "ai_threads",
  exam_values: "exams",
};

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
  "blood_pressure_logs",
  "body_measurements",
  "body_goals",
  "body_photos",
  "metabolic_alerts",
  "exams",
  "exam_values",
  "health_snapshots",
  "health_events",
  "insight_findings",
  "metabolic_audits",
  "insulin_logs",
  "hypo_plan",
  "hypo_events",
  "user_substance_windows",
  "ai_threads",
  "ai_messages",
  "ai_usage",
  "push_subscriptions",
  "push_dispatch_log",
  "cgm_connections",
  "google_fit_connections",
] as const;

/**
 * Coluna de ordenação da exportação paginada. Precisa ser ÚNICA por usuário:
 * paginar por offset sobre coluna repetida pode duplicar ou pular linha na
 * fronteira da página. Padrão `id`; as exceções são tabelas sem `id`.
 * O teste confere que cada coluna existe no `create table` da tabela.
 */
export const EXPORT_ORDER_COLUMN: Partial<Record<(typeof USER_DATA_EXPORT_TABLES)[number], string>> = {
  hypo_plan: "user_id",
  user_substance_windows: "canonical",
  google_fit_connections: "user_id",
  // PK (user_id, provider) desde 20260715150000: por usuário, provider é único.
  cgm_connections: "provider",
};

export const PRIVATE_PHOTO_BUCKETS = ["meal-photos", "medication-labels", "body-photos"] as const;

/** Colunas sensíveis removidas do export (nunca saem no JSON do usuário). */
export const EXPORT_REDACT_COLUMNS: Record<string, readonly string[]> = {
  cgm_connections: ["credentials_enc"],
  google_fit_connections: ["tokens_enc"],
};

/**
 * Colunas do perfil limpas na exclusão. A conta Auth permanece, e com ela o
 * que é conta e não dado clínico: id, e-mail, fuso, papéis (is_admin,
 * disabled), datas. Os parâmetros de insulina (`carb_ratio`,
 * `correction_factor`, `target_glucose_bolus`) ficavam para trás até 14/10/2026.
 */
export const PROFILE_RESET_NULL_COLUMNS = [
  "full_name",
  "diabetes_type",
  "sex",
  "birth_year",
  "height_cm",
  "activity_level",
  "body_goal",
  "target_weight_kg",
  "family_history",
  "primary_focus",
  "carb_ratio",
  "correction_factor",
  "target_glucose_bolus",
] as const;

/** Colunas do perfil que NÃO são limpas, com o motivo — o teste exige que toda coluna esteja numa das duas listas. */
export const PROFILE_KEPT_COLUMNS: Record<string, string> = {
  id: "identidade da conta",
  email: "login da conta, que permanece",
  timezone: "configuração, não dado clínico",
  is_admin: "papel, protegido por trigger",
  disabled: "papel, protegido por trigger",
  onboarding_done: "volta a false no reset",
  target_glucose_min: "volta ao padrão no reset",
  target_glucose_max: "volta ao padrão no reset",
  ia_sugestao_automatica: "volta a false no reset — apagar tudo revoga o consentimento da sugestão por IA",
  created_at: "metadado da conta",
  updated_at: "metadado da conta",
};
