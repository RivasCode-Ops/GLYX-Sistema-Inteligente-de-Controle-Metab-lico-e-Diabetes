/**
 * Tipos da aplicação, **derivados do schema real** (`types/supabase.generated.ts`).
 *
 * Antes eram escritos à mão e divergiam do banco silenciosamente sempre que
 * alguém esquecia de atualizá-los — risco registrado em §10.9 do contexto
 * técnico. Agora a linha vem do gerador: coluna renomeada, removida ou com tipo
 * trocado vira **erro de compilação**, não bug de execução.
 *
 * O que continua sendo escrito à mão é só o **estreitamento**: o Postgres
 * guarda `severity text` com um CHECK, e nenhum gerador consegue transformar
 * CHECK em união de literais. Cada estreitamento abaixo é uma promessa que o
 * banco garante por constraint e que o TypeScript passa a cobrar no código.
 *
 * Regenerar depois de migration: `npm run types:gen`.
 */

import type { Json, Tables } from "@/types/supabase.generated";

/**
 * Troca campos da linha gerada por versões mais estreitas, preservando todo o
 * resto. Se a coluna estreitada sumir do schema, `Omit` não a encontra e o tipo
 * passa a ter um campo que o banco não tem — por isso cada uso vem acompanhado
 * de `ColumnOf`, que falha na compilação se o nome deixar de existir.
 */
type Narrow<Row, Fields extends Partial<Record<keyof Row, unknown>>> = Omit<Row, keyof Fields> &
  Fields;

export type { Json };

export type AlertSeverity = "info" | "warning" | "critical";
export type HealthSnapshotSourceName = "apple_health" | "google_fit" | "manual" | "mock";
export type AuditLabelName = "Estável" | "Atenção" | "Alerta" | "Dados insuficientes";
export type MedicationKind = "med" | "supplement";
export type BodyPhotoPose = "frente" | "costas" | "perfil_esq" | "perfil_dir";

/**
 * Módulo dono de um achado em `insight_findings`. A tabela é compartilhada: a
 * unicidade no banco é `(user_id, module, slug)`, então dois módulos podem usar
 * o mesmo slug sem um sobrescrever o outro no upsert.
 */
export type InsightModule = "glucose" | "body";

export type GlucoseReading = Narrow<
  Tables<"glucose_readings">,
  { metadata: Record<string, unknown> | null }
>;

export type Meal = Tables<"meals">;

export type WaterLog = Tables<"water_logs">;

export type Medication = Narrow<Tables<"medications">, { kind: MedicationKind }>;

export type ExerciseSession = Tables<"exercise_sessions">;

export type MetabolicAlert = Narrow<
  Tables<"metabolic_alerts">,
  { severity: AlertSeverity; context: Record<string, unknown> | null }
>;

export type InsightFinding = Narrow<
  Tables<"insight_findings">,
  { severity: AlertSeverity; metrics: Record<string, unknown> | null; module: InsightModule }
>;

export type MetabolicAudit = Narrow<
  Tables<"metabolic_audits">,
  {
    label: AuditLabelName;
    metrics: Record<string, unknown>;
    factors: unknown[];
    plan: unknown[];
  }
>;

export type HealthSnapshot = Narrow<
  Tables<"health_snapshots">,
  { source: HealthSnapshotSourceName; metadata: Record<string, unknown> | null }
>;

/**
 * `profiles` é o centro da configuração: identidade, alvos clínicos, parâmetros
 * de bolus, corpo, fuso e flags. Os quatro estreitamentos abaixo correspondem a
 * CHECKs da tabela.
 */
export type Profile = Narrow<
  Tables<"profiles">,
  {
    sex: "m" | "f" | null;
    activity_level: "sedentary" | "light" | "moderate" | "very" | null;
    body_goal: "lose" | "gain" | "maintain" | "recomp" | null;
    primary_focus: "diabetes" | "lose" | "gain" | null;
  }
>;

export type BloodPressureLog = Tables<"blood_pressure_logs">;

export type WeightLog = Tables<"weight_logs">;

export type StrengthLog = Tables<"strength_logs">;

export type MusclePause = Tables<"muscle_pauses">;

export type Exam = Tables<"exams">;

export type InsulinLog = Tables<"insulin_logs">;

export type MedicationLog = Tables<"medication_logs">;

export type MedicationSnooze = Tables<"medication_snoozes">;

/**
 * Medidas corporais. As 21 colunas de medida têm catálogo próprio em
 * `lib/body/fields.ts` (rótulo, unidade, papel) — aqui fica só a linha crua.
 */
export type BodyMeasurementRow = Tables<"body_measurements">;

export type BodyGoalRowDb = Tables<"body_goals">;

export type BodyPhoto = Narrow<Tables<"body_photos">, { pose: BodyPhotoPose }>;
