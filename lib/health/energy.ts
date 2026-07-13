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
  carbs_g: number;
  fat_g: number;
  deficitOrSurplus: number;
};

/**
 * Divide as calorias restantes (após a proteína) entre carboidrato e
 * gordura, 50/50 em calorias — padrão educativo simples e neutro para
 * controle glicêmico. 4 kcal/g carboidrato, 9 kcal/g gordura.
 */
function splitCarbsFat(calories: number, proteinG: number): { carbs_g: number; fat_g: number } {
  const remaining = Math.max(0, calories - proteinG * 4);
  return {
    carbs_g: Math.round(remaining * 0.5 / 4),
    fat_g: Math.round(remaining * 0.5 / 9),
  };
}

/** Metas diárias por objetivo. Piso de 1200 kcal (nunca sugerir menos). */
export function dailyTargets(profile: BodyProfile, goal: BodyGoal): DailyTargets {
  const expenditure = tdee(profile);
  switch (goal) {
    case "lose": {
      const calories = Math.max(1200, expenditure - 500);
      const protein_g = Math.round(1.6 * profile.weightKg);
      return { calories, protein_g, ...splitCarbsFat(calories, protein_g), deficitOrSurplus: -500 };
    }
    case "gain": {
      const calories = expenditure + 300;
      const protein_g = Math.round(1.8 * profile.weightKg);
      return { calories, protein_g, ...splitCarbsFat(calories, protein_g), deficitOrSurplus: 300 };
    }
    case "maintain": {
      const calories = expenditure;
      const protein_g = Math.round(1.2 * profile.weightKg);
      return { calories, protein_g, ...splitCarbsFat(calories, protein_g), deficitOrSurplus: 0 };
    }
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

export type WeightPoint = { weightKg: number; loggedOn: string };

/**
 * Tendência de peso suavizada: média ponderada com mais peso nos registros
 * recentes, para ignorar flutuações de água (sal, carboidrato, creatina).
 */
export function smoothedWeight(points: WeightPoint[]): number | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => (a.loggedOn < b.loggedOn ? 1 : -1));
  let sum = 0;
  let weightSum = 0;
  sorted.slice(0, 8).forEach((p, i) => {
    const w = 1 / (i + 1);
    sum += p.weightKg * w;
    weightSum += w;
  });
  return Math.round((sum / weightSum) * 10) / 10;
}

export type Adjustment = {
  observedWeeklyKg: number;
  plannedWeeklyKg: number;
  deltaKcal: number;
  reason: string;
};

/**
 * Ajuste dinâmico semanal: compara o ritmo real de mudança de peso com o
 * planejado e sugere correção calórica com guardrails (máx. ±150 kcal por
 * ajuste — nunca reagir 1:1 a flutuações, padrão validado pelo MacroFactor).
 * Exige >= 4 pesagens em >= 14 dias para não reagir a ruído.
 */
export function adaptiveAdjustment(
  points: WeightPoint[],
  goal: BodyGoal,
  currentWeightKg: number
): Adjustment | null {
  if (points.length < 4) return null;
  const sorted = [...points].sort((a, b) => (a.loggedOn < b.loggedOn ? -1 : 1));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days =
    (new Date(last.loggedOn).getTime() - new Date(first.loggedOn).getTime()) / 86_400_000;
  if (days < 14) return null;

  const observedWeekly = Math.round(((last.weightKg - first.weightKg) / days) * 7 * 100) / 100;
  const plannedWeekly =
    goal === "lose"
      ? -safeWeeklyRateKg(currentWeightKg, goal)
      : safeWeeklyRateKg(currentWeightKg, goal);

  // ~7700 kcal por kg; convertido para desvio diário e limitado a ±150
  const dailyGapKcal = ((plannedWeekly - observedWeekly) * 7700) / 7;
  const deltaKcal = Math.max(-150, Math.min(150, Math.round(dailyGapKcal / 50) * 50));

  const reason =
    deltaKcal === 0
      ? "Ritmo dentro do planejado — mantenha as metas atuais."
      : goal === "lose"
        ? deltaKcal < 0
          ? "Perda mais lenta que o planejado — reduza levemente as calorias."
          : "Perda mais rápida que o seguro — coma um pouco mais para proteger massa magra."
        : deltaKcal > 0
          ? "Ganho mais lento que o planejado — aumente levemente as calorias."
          : "Ganho mais rápido que o ideal — reduza para priorizar músculo, não gordura.";

  return { observedWeeklyKg: observedWeekly, plannedWeeklyKg: plannedWeekly, deltaKcal, reason };
}
