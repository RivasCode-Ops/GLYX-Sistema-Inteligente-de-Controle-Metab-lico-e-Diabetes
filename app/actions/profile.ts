"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  isCoherentTargetRange,
  MIN_TARGET_SPAN_MG_DL,
  TARGET_MAX_CEIL_MG_DL,
  TARGET_MAX_FLOOR_MG_DL,
  TARGET_MIN_CEIL_MG_DL,
  TARGET_MIN_FLOOR_MG_DL,
} from "@/lib/health/glucose-thresholds";

/**
 * Faixa-alvo aceitava número livre: `min > max`, negativo ou 5000 entravam no
 * banco e vazavam para TIR, mapa de risco, alerta de hipo e prompt da IA — o
 * app inteiro passa a calcular sobre uma faixa que não existe. Os limites são
 * de sanidade, não conduta clínica: a faixa real é combinada com o médico
 * dentro desses limites.
 */
const targetRangeIssue = (min?: number, max?: number): string | null => {
  if (min == null && max == null) return null;
  if (min == null || max == null) {
    return "Informe a meta mínima e a máxima juntas.";
  }
  if (min < TARGET_MIN_FLOOR_MG_DL || min > TARGET_MIN_CEIL_MG_DL) {
    return `Meta mínima deve ficar entre ${TARGET_MIN_FLOOR_MG_DL} e ${TARGET_MIN_CEIL_MG_DL} mg/dL.`;
  }
  if (max < TARGET_MAX_FLOOR_MG_DL || max > TARGET_MAX_CEIL_MG_DL) {
    return `Meta máxima deve ficar entre ${TARGET_MAX_FLOOR_MG_DL} e ${TARGET_MAX_CEIL_MG_DL} mg/dL.`;
  }
  if (!isCoherentTargetRange(min, max)) {
    return `A meta máxima precisa ficar pelo menos ${MIN_TARGET_SPAN_MG_DL} mg/dL acima da mínima.`;
  }
  return null;
};

const schema = z.object({
  full_name: z.string().optional(),
  diabetes_type: z.string().optional(),
  target_glucose_min: z.coerce.number().optional(),
  target_glucose_max: z.coerce.number().optional(),
  sex: z.enum(["m", "f"]).optional(),
  birth_year: z.coerce.number().int().min(1900).max(2030).optional(),
  height_cm: z.coerce.number().int().min(80).max(250).optional(),
  activity_level: z.enum(["sedentary", "light", "moderate", "very"]).optional(),
  body_goal: z.enum(["lose", "gain", "maintain", "recomp"]).optional(),
  target_weight_kg: z.coerce.number().min(20).max(400).optional(),
  family_history: z.string().max(500).optional(),
  carb_ratio: z.coerce.number().min(1).max(200).optional(),
  correction_factor: z.coerce.number().min(1).max(200).optional(),
  target_glucose_bolus: z.coerce.number().int().min(50).max(300).optional(),
});

export type ActionResult = { ok?: true; error?: string };

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    full_name: formData.get("full_name") || undefined,
    diabetes_type: formData.get("diabetes_type") || undefined,
    target_glucose_min: formData.get("target_glucose_min") || undefined,
    target_glucose_max: formData.get("target_glucose_max") || undefined,
    sex: formData.get("sex") || undefined,
    birth_year: formData.get("birth_year") || undefined,
    height_cm: formData.get("height_cm") || undefined,
    activity_level: formData.get("activity_level") || undefined,
    body_goal: formData.get("body_goal") || undefined,
    target_weight_kg: formData.get("target_weight_kg") || undefined,
    family_history: formData.get("family_history") || undefined,
    carb_ratio: formData.get("carb_ratio") || undefined,
    correction_factor: formData.get("correction_factor") || undefined,
    target_glucose_bolus: formData.get("target_glucose_bolus") || undefined,
  });
  if (!parsed.success) return { error: "Dados inválidos." };

  const rangeIssue = targetRangeIssue(
    parsed.data.target_glucose_min,
    parsed.data.target_glucose_max
  );
  if (rangeIssue) return { error: rangeIssue };

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/perfil");
  return { ok: true };
}

const onboardingSchema = z.object({
  primary_focus: z.enum(["diabetes", "lose", "gain"]),
  diabetes_type: z.string().max(60).optional(),
  sex: z.enum(["m", "f"]).optional(),
  birth_year: z.coerce.number().int().min(1900).max(2030).optional(),
  height_cm: z.coerce.number().int().min(80).max(250).optional(),
  activity_level: z.enum(["sedentary", "light", "moderate", "very"]).optional(),
  weight_kg: z.coerce.number().min(20).max(400).optional(),
  target_weight_kg: z.coerce.number().min(20).max(400).optional(),
});

export async function completeOnboarding(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = onboardingSchema.safeParse({
    primary_focus: formData.get("primary_focus"),
    diabetes_type: formData.get("diabetes_type") || undefined,
    sex: formData.get("sex") || undefined,
    birth_year: formData.get("birth_year") || undefined,
    height_cm: formData.get("height_cm") || undefined,
    activity_level: formData.get("activity_level") || undefined,
    weight_kg: formData.get("weight_kg") || undefined,
    target_weight_kg: formData.get("target_weight_kg") || undefined,
  });
  if (!parsed.success) return { error: "Escolha um foco para começar." };

  const { weight_kg, ...profileData } = parsed.data;
  const bodyGoal =
    profileData.primary_focus === "lose"
      ? "lose"
      : profileData.primary_focus === "gain"
        ? "gain"
        : "maintain";

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      ...profileData,
      body_goal: bodyGoal,
      onboarding_done: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) return { error: error.message };

  if (weight_kg) {
    await supabase.from("weight_logs").upsert(
      {
        user_id: user.id,
        weight_kg,
        logged_on: new Date().toISOString().slice(0, 10),
      },
      { onConflict: "user_id,logged_on" }
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/perfil");
  return { ok: true };
}

export async function logWeight(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const weight = Number.parseFloat(String(formData.get("weight_kg") ?? "").replace(",", "."));
  if (!Number.isFinite(weight) || weight <= 20 || weight >= 400) {
    return { error: "Informe um peso válido em kg." };
  }

  // Uma pesagem por dia: a mais recente substitui
  const { error } = await supabase.from("weight_logs").upsert(
    {
      user_id: user.id,
      weight_kg: weight,
      logged_on: new Date().toISOString().slice(0, 10),
    },
    { onConflict: "user_id,logged_on" }
  );

  if (error) return { error: error.message };

  revalidatePath("/perfil");
  revalidatePath("/dashboard");
  return { ok: true };
}
