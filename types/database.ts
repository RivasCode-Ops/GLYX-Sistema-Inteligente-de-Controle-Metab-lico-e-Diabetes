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
  eaten_at: string;
  created_at: string;
};

export type Medication = {
  id: string;
  user_id: string;
  name: string;
  dosage: string | null;
  schedule_hint: string | null;
  active: boolean;
  notes: string | null;
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
  created_at: string;
  updated_at: string;
};
