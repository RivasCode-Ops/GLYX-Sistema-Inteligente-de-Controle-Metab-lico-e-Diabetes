export type GlucoseReading = {
  id: string;
  user_id: string;
  value_mg_dl: number;
  context: string | null;
  source: string;
  recorded_at: string;
  notes: string | null;
  /** CGM: id do fabricante para dedup */
  external_id?: string | null;
  trend?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type Meal = {
  id: string;
  user_id: string;
  name: string | null;
  calories: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  glycemic_load_estimate: number | null;
  notes: string | null;
  photo_path: string | null;
  glucose_spike?: boolean | null;
  /** Usuário ajustou algum valor estimado pela IA antes de salvar. */
  ai_corrected?: boolean | null;
  eaten_at: string;
  created_at: string;
};

export type WaterLog = {
  id: string;
  user_id: string;
  amount_ml: number;
  logged_at: string;
};

export type Medication = {
  id: string;
  user_id: string;
  name: string;
  dosage: string | null;
  schedule_hint: string | null;
  active: boolean;
  notes: string | null;
  reminder_times?: string[] | null;
  stock_units?: number | null;
  stock_updated_on?: string | null;
  kind?: "med" | "supplement";
  label_photo_path?: string | null;
  created_at: string;
};

export type ExerciseSession = {
  id: string;
  user_id: string;
  label: string;
  duration_min: number | null;
  calories_burned: number | null;
  intensity: string | null;
  started_at: string;
  notes: string | null;
  created_at: string;
  muscle_groups?: string[] | null;
  activity_type?: string | null;
};

export type MetabolicAlert = {
  id: string;
  user_id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  context: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type InsightFinding = {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  metrics: Record<string, unknown> | null;
  computed_at: string;
};

export type MetabolicAudit = {
  id: string;
  user_id: string;
  window_days: number;
  period_start: string;
  period_end: string;
  score: number;
  label: "Estável" | "Atenção" | "Alerta" | "Dados insuficientes";
  metrics: Record<string, unknown>;
  factors: unknown[];
  plan: unknown[];
  computed_at: string;
};

export type HealthSnapshot = {
  id: string;
  user_id: string;
  snapshot_date: string;
  source: "apple_health" | "google_fit" | "manual" | "mock";
  steps: number | null;
  sleep_hours: number | null;
  resting_hr: number | null;
  active_calories: number | null;
  stress_score: number | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  diabetes_type: string | null;
  target_glucose_min: number | null;
  target_glucose_max: number | null;
  timezone: string | null;
  sex?: "m" | "f" | null;
  birth_year?: number | null;
  height_cm?: number | null;
  activity_level?: "sedentary" | "light" | "moderate" | "very" | null;
  body_goal?: "lose" | "gain" | "maintain" | "recomp" | null;
  target_weight_kg?: number | null;
  family_history?: string | null;
  primary_focus?: "diabetes" | "lose" | "gain" | null;
  onboarding_done?: boolean;
  /** Gramas de carboidrato compensados por 1 unidade de insulina rápida. */
  carb_ratio?: number | null;
  /** mg/dL que 1 unidade de insulina reduz. */
  correction_factor?: number | null;
  /** Meta de glicemia usada só na calculadora de bolus (distinta de target_glucose_min/max). */
  target_glucose_bolus?: number | null;
  created_at: string;
  updated_at: string;
};

export type BloodPressureLog = {
  id: string;
  user_id: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  recorded_at: string;
  notes: string | null;
  created_at: string;
};

export type WeightLog = {
  id: string;
  user_id: string;
  weight_kg: number;
  logged_on: string;
  created_at: string;
};
