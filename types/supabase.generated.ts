/**
 * GERADO A PARTIR DO SCHEMA — NÃO EDITAR À MÃO.
 *
 * Regenerar depois de qualquer migration:
 *   npm run types:gen
 *
 * Os tipos que a aplicação usa ficam em `types/database.ts` e são derivados
 * daqui. Editar este arquivo à mão reintroduz exatamente a deriva que ele
 * existe para eliminar.
 *
 * Última geração: 2026-07-30 (projeto ajlbtahvmirdgiwycecb, schema public), a
 * partir do schema real do banco. Esta versão traz só `Row` por tabela, que é o
 * que a aplicação consome; a saída do CLI do Supabase é um superconjunto (inclui
 * `Insert`/`Update` e os helpers `TablesInsert`/`TablesUpdate`) e sobrescreve
 * este arquivo inteiro — `database.ts` usa apenas `Tables<>` e `Json`, que
 * continuam existindo lá.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          role: string;
          seq: number;
          thread_id: string;
          user_id: string;
        };
      };
      ai_threads: {
        Row: {
          created_at: string;
          id: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
      };
      ai_usage: {
        Row: {
          completion_tokens: number | null;
          created_at: string;
          id: string;
          kind: string;
          model: string | null;
          prompt_tokens: number | null;
          user_id: string;
        };
      };
      blood_pressure_logs: {
        Row: {
          created_at: string;
          diastolic: number;
          id: string;
          notes: string | null;
          pulse: number | null;
          recorded_at: string;
          systolic: number;
          user_id: string;
        };
      };
      body_goals: {
        Row: {
          created_at: string;
          id: string;
          metric: string;
          start_on: string;
          start_value: number | null;
          target_date: string | null;
          target_value: number;
          updated_at: string;
          user_id: string;
        };
      };
      body_measurements: {
        Row: {
          abdomen_cm: number | null;
          arm_left_flexed_cm: number | null;
          arm_left_relaxed_cm: number | null;
          arm_right_flexed_cm: number | null;
          arm_right_relaxed_cm: number | null;
          calf_left_cm: number | null;
          calf_right_cm: number | null;
          chest_cm: number | null;
          created_at: string;
          forearm_cm: number | null;
          hip_cm: number | null;
          id: string;
          measured_on: string;
          neck_cm: number | null;
          notes: string | null;
          shoulders_cm: number | null;
          skf_abdominal_mm: number | null;
          skf_chest_mm: number | null;
          skf_suprailiac_mm: number | null;
          skf_thigh_mm: number | null;
          skf_triceps_mm: number | null;
          thigh_left_cm: number | null;
          thigh_right_cm: number | null;
          user_id: string;
          waist_cm: number | null;
          weight_kg: number | null;
        };
      };
      body_photos: {
        Row: {
          created_at: string;
          id: string;
          photo_path: string;
          pose: string;
          taken_on: string;
          user_id: string;
        };
      };
      cgm_connections: {
        Row: {
          circuit_open_until: string | null;
          consecutive_failures: number;
          created_at: string;
          credentials_enc: string;
          email: string | null;
          last_error: string | null;
          last_error_kind: string | null;
          last_sync_at: string | null;
          patient_id: string | null;
          provider: string;
          user_id: string;
        };
      };
      exams: {
        Row: {
          created_at: string;
          exam_type: string;
          id: string;
          lab_name: string | null;
          parsed_summary: Json | null;
          raw_text: string | null;
          title: string | null;
          user_id: string;
        };
      };
      exercise_sessions: {
        Row: {
          activity_type: string | null;
          calories_burned: number | null;
          created_at: string;
          duration_min: number | null;
          id: string;
          intensity: string | null;
          label: string;
          muscle_groups: string[] | null;
          notes: string | null;
          started_at: string;
          user_id: string;
        };
      };
      exercises: {
        Row: {
          created_at: string;
          id: string;
          mechanic: string;
          name: string;
          primary_muscle: string | null;
          slug: string;
          source_category: string;
        };
      };
      glucose_readings: {
        Row: {
          context: string | null;
          created_at: string;
          external_id: string | null;
          id: string;
          metadata: Json | null;
          notes: string | null;
          recorded_at: string;
          source: string;
          trend: string | null;
          user_id: string;
          value_mg_dl: number;
        };
      };
      google_fit_connections: {
        Row: {
          created_at: string;
          last_error: string | null;
          last_sync_at: string | null;
          tokens_enc: string;
          updated_at: string;
          user_id: string;
        };
      };
      health_snapshots: {
        Row: {
          active_calories: number | null;
          created_at: string;
          id: string;
          metadata: Json | null;
          resting_hr: number | null;
          sleep_hours: number | null;
          snapshot_date: string;
          source: string;
          steps: number | null;
          stress_score: number | null;
          updated_at: string;
          user_id: string;
        };
      };
      insight_findings: {
        Row: {
          body: string;
          computed_at: string;
          id: string;
          metrics: Json | null;
          module: string;
          severity: string;
          slug: string;
          title: string;
          user_id: string;
        };
      };
      insulin_logs: {
        Row: {
          applied_at: string;
          created_at: string;
          glucose_mg_dl: number | null;
          id: string;
          insulin_kind: string;
          notes: string | null;
          reason: string;
          units: number;
          user_id: string;
        };
      };
      meals: {
        Row: {
          ai_corrected: boolean;
          calories: number | null;
          carbs_g: number | null;
          created_at: string;
          eaten_at: string;
          fat_g: number | null;
          glucose_spike: boolean | null;
          glycemic_load_estimate: number | null;
          id: string;
          name: string | null;
          notes: string | null;
          photo_path: string | null;
          protein_g: number | null;
          user_id: string;
        };
      };
      medication_logs: {
        Row: {
          confirmed: boolean;
          created_at: string;
          id: string;
          medication_id: string | null;
          taken_at: string;
          user_id: string;
        };
      };
      medication_snoozes: {
        Row: {
          created_at: string;
          fired: boolean;
          id: string;
          medication_id: string;
          snoozed_until: string;
          user_id: string;
        };
      };
      medications: {
        Row: {
          active: boolean;
          created_at: string;
          dosage: string | null;
          id: string;
          kind: string;
          label_photo_path: string | null;
          name: string;
          notes: string | null;
          reminder_times: string[] | null;
          schedule_hint: string | null;
          stock_units: number | null;
          stock_updated_on: string | null;
          user_id: string;
        };
      };
      metabolic_alerts: {
        Row: {
          body: string | null;
          context: Json | null;
          created_at: string;
          id: string;
          read_at: string | null;
          severity: string;
          title: string;
          user_id: string;
        };
      };
      metabolic_audits: {
        Row: {
          computed_at: string;
          factors: Json;
          id: string;
          label: string;
          metrics: Json;
          period_end: string;
          period_start: string;
          plan: Json;
          score: number;
          user_id: string;
          window_days: number;
        };
      };
      muscle_pauses: {
        Row: {
          id: string;
          muscle_group: string;
          paused_at: string;
          reason: string | null;
          resumed_at: string | null;
          user_id: string;
        };
      };
      profiles: {
        Row: {
          activity_level: string | null;
          birth_year: number | null;
          body_goal: string | null;
          carb_ratio: number | null;
          correction_factor: number | null;
          created_at: string;
          diabetes_type: string | null;
          disabled: boolean;
          email: string | null;
          family_history: string | null;
          full_name: string | null;
          height_cm: number | null;
          id: string;
          is_admin: boolean;
          onboarding_done: boolean;
          primary_focus: string | null;
          sex: string | null;
          target_glucose_bolus: number | null;
          target_glucose_max: number | null;
          target_glucose_min: number | null;
          target_weight_kg: number | null;
          timezone: string | null;
          updated_at: string;
        };
      };
      push_dispatch_log: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          ref: string;
          sent_on: string;
          user_id: string;
        };
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
      };
      strength_logs: {
        Row: {
          created_at: string;
          exercise_id: string | null;
          exercise_name: string;
          id: string;
          logged_at: string;
          muscle_group: string | null;
          reps: number;
          sets: number;
          user_id: string;
          weight_kg: number | null;
        };
      };
      water_logs: {
        Row: {
          amount_ml: number;
          id: string;
          kind: string;
          logged_at: string;
          user_id: string;
        };
      };
      weight_logs: {
        Row: {
          created_at: string;
          id: string;
          logged_on: string;
          user_id: string;
          weight_kg: number;
        };
      };
    };
  };
};

/** Linha de uma tabela do schema public, como o Postgres a devolve. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
