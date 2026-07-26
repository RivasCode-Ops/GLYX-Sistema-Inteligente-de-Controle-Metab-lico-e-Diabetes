/**
 * Construtores de linha completa a partir de um parcial.
 *
 * Desde que os tipos passaram a ser derivados do schema
 * (`types/supabase.generated.ts`), uma linha do banco tem **todas** as colunas —
 * é o que `select("*")` devolve de verdade. Isso é correto para o código de
 * produção e chato para demo e teste, que só se importam com 3 ou 4 campos.
 *
 * Sem estes construtores, cada coluna nova quebraria toda fixture do repo e a
 * reação natural seria afrouxar o tipo de volta. Com eles, o default mora num
 * lugar só: coluna nova = um default aqui, e nenhuma fixture muda.
 */

import type {
  ExerciseSession,
  Meal,
  Medication,
  Profile,
} from "@/types/database";

export function makeProfile(over: Partial<Profile> & Pick<Profile, "id">): Profile {
  return {
    activity_level: null,
    birth_year: null,
    body_goal: null,
    carb_ratio: null,
    correction_factor: null,
    created_at: new Date(0).toISOString(),
    diabetes_type: null,
    disabled: false,
    email: null,
    family_history: null,
    full_name: null,
    height_cm: null,
    is_admin: false,
    onboarding_done: true,
    primary_focus: null,
    sex: null,
    target_glucose_bolus: null,
    target_glucose_max: null,
    target_glucose_min: null,
    target_weight_kg: null,
    timezone: null,
    updated_at: new Date(0).toISOString(),
    ...over,
  };
}

export function makeMeal(over: Partial<Meal> & Pick<Meal, "id" | "user_id">): Meal {
  return {
    ai_corrected: false,
    calories: null,
    carbs_g: null,
    created_at: new Date(0).toISOString(),
    eaten_at: new Date(0).toISOString(),
    fat_g: null,
    glucose_spike: null,
    glycemic_load_estimate: null,
    name: null,
    notes: null,
    photo_path: null,
    protein_g: null,
    ...over,
  };
}

export function makeMedication(
  over: Partial<Medication> & Pick<Medication, "id" | "user_id" | "name">
): Medication {
  return {
    active: true,
    created_at: new Date(0).toISOString(),
    dosage: null,
    kind: "med",
    label_photo_path: null,
    notes: null,
    reminder_times: null,
    schedule_hint: null,
    stock_units: null,
    stock_updated_on: null,
    ...over,
  };
}

export function makeExerciseSession(
  over: Partial<ExerciseSession> & Pick<ExerciseSession, "id" | "user_id" | "label">
): ExerciseSession {
  return {
    activity_type: null,
    calories_burned: null,
    created_at: new Date(0).toISOString(),
    duration_min: null,
    intensity: null,
    muscle_groups: null,
    notes: null,
    started_at: new Date(0).toISOString(),
    ...over,
  };
}
