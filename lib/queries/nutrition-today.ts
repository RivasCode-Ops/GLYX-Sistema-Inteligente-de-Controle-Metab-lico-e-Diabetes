import { createClient } from "@/lib/supabase/server";
import { isBeverageKind, isHydrating } from "@/lib/health/beverages";
import { dailyTargets } from "@/lib/health/energy";
import type { ActivityLevel, BodyGoal, Sex } from "@/lib/health/energy";
import { startOfLocalDayISO } from "@/lib/time/local-day";
import type { BeverageSummary } from "@/components/dashboard/water-card";

/**
 * Água, bebidas e macros do dia — implementação ÚNICA.
 *
 * Este cálculo morava dentro de `app/(app)/dashboard/page.tsx`, e as telas de
 * água e de macros moravam no painel junto com ele. Com a redistribuição, os
 * cards passam para o módulo Alimentação, que é onde se REGISTRA — o painel é
 * vista breve do que fazer agora, não superfície de registro.
 *
 * O cálculo vira função compartilhada em vez de ser copiado: duas contagens da
 * mesma grandeza em telas diferentes é o defeito que já apareceu neste app
 * (adesão contada de dois jeitos, "Inferior A" × "0 min"). Uma implementação,
 * dois chamadores.
 */

export type NutritionToday = {
  /** só bebidas hidratantes contam para a meta */
  waterMl: number;
  waterGoalMl: number;
  /** café, chá, refrigerante diet — resumo, fora da meta */
  beverageExtras: BeverageSummary[];
  macroConsumed: { calories: number; carbs_g: number; protein_g: number; fat_g: number } | null;
  macroTargets: { calories: number; carbs_g: number; protein_g: number; fat_g: number } | null;
};

const VAZIO: NutritionToday = {
  waterMl: 0,
  waterGoalMl: 2000,
  beverageExtras: [],
  macroConsumed: null,
  macroTargets: null,
};

export async function getNutritionToday(): Promise<NutritionToday> {
  const supabase = await createClient();
  if (!supabase) return VAZIO;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return VAZIO;

  const { data: p } = await supabase
    .from("profiles")
    .select("sex, birth_year, height_cm, activity_level, body_goal, timezone")
    .eq("id", user.id)
    .maybeSingle();

  const startOfDayISO = startOfLocalDayISO(p?.timezone);

  const [waterRes, mealsRes, weightRes] = await Promise.all([
    supabase
      .from("water_logs")
      .select("amount_ml, kind")
      .eq("user_id", user.id)
      .gte("logged_at", startOfDayISO),
    supabase
      .from("meals")
      .select("calories, carbs_g, protein_g, fat_g")
      .eq("user_id", user.id)
      .gte("eaten_at", startOfDayISO),
    supabase
      .from("weight_logs")
      .select("weight_kg")
      .eq("user_id", user.id)
      .order("logged_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Só bebidas hidratantes contam pra meta; o resto vira o resumo de extras.
  const beverageRows = (waterRes.data ?? []) as { amount_ml: number | null; kind: string | null }[];
  const waterMl = beverageRows
    .filter((w) => isHydrating(w.kind ?? "agua"))
    .reduce((s, w) => s + (w.amount_ml ?? 0), 0);

  const extrasMap = new Map<string, BeverageSummary>();
  for (const w of beverageRows) {
    const kind = w.kind ?? "agua";
    if (isHydrating(kind) || !isBeverageKind(kind)) continue;
    const cur = extrasMap.get(kind) ?? { kind, count: 0, totalMl: 0 };
    cur.count += 1;
    cur.totalMl += w.amount_ml ?? 0;
    extrasMap.set(kind, cur);
  }

  const weightKg = weightRes.data?.weight_kg ? Number(weightRes.data.weight_kg) : null;

  const macroConsumed = (mealsRes.data ?? []).reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories ?? 0),
      carbs_g: acc.carbs_g + (m.carbs_g ?? 0),
      protein_g: acc.protein_g + (m.protein_g ?? 0),
      fat_g: acc.fat_g + (m.fat_g ?? 0),
    }),
    { calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }
  );

  const macroTargets =
    p?.sex && p.birth_year && p.height_cm && p.activity_level && weightKg
      ? dailyTargets(
          {
            sex: p.sex as Sex,
            age: new Date().getFullYear() - p.birth_year,
            heightCm: p.height_cm,
            weightKg,
            activity: p.activity_level as ActivityLevel,
          },
          (p.body_goal as BodyGoal | null) ?? "maintain"
        )
      : null;

  return {
    waterMl,
    waterGoalMl: weightKg ? Math.round(weightKg * 35) : 2000,
    beverageExtras: [...extrasMap.values()],
    macroConsumed,
    macroTargets,
  };
}
