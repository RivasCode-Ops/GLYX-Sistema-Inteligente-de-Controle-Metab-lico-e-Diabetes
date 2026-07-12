/**
 * Cálculo energético para o objetivo corporal.
 *
 * Fórmulas e limites baseados em prática consolidada e diretrizes:
 * - BMR: Mifflin-St Jeor (padrão em Cronometer/MyFitnessPal)
 * - Déficit para emagrecer: 500 kcal/dia (ADA Standards of Care, Seção 8:
 *   déficit estruturado de 500-750 kcal/dia; usamos o piso conservador)
 * - Superávit para massa: +300 kcal/dia (conservador, evita picos glicêmicos)
 * - Proteína: 1,2-1,8 g/kg conforme objetivo
 * Valores são educativos — ajustes terapêuticos são do médico/nutricionista.
 */

export type Sex = "m" | "f";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very";
export type BodyGoal = "lose" | "gain" | "maintain";

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: "Sedentário",
  light: "Leve (1-3x/semana)",
  moderate: "Moderado (3-5x/semana)",
  very: "Intenso (6-7x/semana)",
};

export const GOAL_LABEL: Record<BodyGoal, string> = {
  lose: "Emagrecer",
  gain: "Ganhar massa muscular",
  maintain: "Manter / controle glicêmico",
};

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};

export type BodyProfile = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
};

/** Taxa metabólica basal (kcal/dia) — Mifflin-St Jeor. */
export function bmr({ sex, age, heightCm, weightKg }: Omit<BodyProfile, "activity">): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "m" ? 5 : -161));
}

/** Gasto energético diário total estimado (kcal/dia). */
export function tdee(profile: BodyProfile): number {
  return Math.round(bmr(profile) * ACTIVITY_FACTOR[profile.activity]);
}

export type DailyTargets = {
  calories: number;
  protein_g: number;
  deficitOrSurplus: number;
};

/** Metas diárias por objetivo. Piso de 1200 kcal (nunca sugerir menos). */
export function dailyTargets(profile: BodyProfile, goal: BodyGoal): DailyTargets {
  const expenditure = tdee(profile);
  switch (goal) {
    case "lose":
      return {
        calories: Math.max(1200, expenditure - 500),
        protein_g: Math.round(1.6 * profile.weightKg),
        deficitOrSurplus: -500,
      };
    case "gain":
      return {
        calories: expenditure + 300,
        protein_g: Math.round(1.8 * profile.weightKg),
        deficitOrSurplus: 300,
      };
    case "maintain":
      return {
        calories: expenditure,
        protein_g: Math.round(1.2 * profile.weightKg),
        deficitOrSurplus: 0,
      };
  }
}

/**
 * Ritmo seguro de mudança de peso (kg/semana): 0,5-1% do peso para perda
 * (usamos 0,75%), ~0,25% para ganho de massa com controle glicêmico.
 */
export function safeWeeklyRateKg(weightKg: number, goal: BodyGoal): number {
  if (goal === "lose") return Math.round(weightKg * 0.0075 * 100) / 100;
  if (goal === "gain") return Math.round(weightKg * 0.0025 * 100) / 100;
  return 0;
}
