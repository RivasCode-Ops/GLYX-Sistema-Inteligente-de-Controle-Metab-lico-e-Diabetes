import { SectionCards } from "@/components/module/section-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickExtrasCard } from "@/components/alimentacao/quick-extras-card";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { startOfLocalDayISO } from "@/lib/time/local-day";
import { demoMeals } from "@/lib/demo/data";
import type { Meal } from "@/types/database";

export default async function AlimentacaoOverviewPage() {
  let meals: Meal[] = [];
  const demoMode = !isSupabaseConfigured();

  if (demoMode) {
    meals = demoMeals as Meal[];
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .maybeSingle();
        const startOfDayISO = startOfLocalDayISO(profile?.timezone);

        const { data } = await supabase
          .from("meals")
          .select("id, user_id, name, calories, carbs_g, protein_g, fat_g, glycemic_load_estimate, notes, photo_path, eaten_at, created_at")
          .eq("user_id", user.id)
          .gte("eaten_at", startOfDayISO)
          .order("eaten_at", { ascending: false });
        meals = (data ?? []) as Meal[];
      }
    }
  }

  const totalCarbs = Math.round(meals.reduce((sum, meal) => sum + (meal.carbs_g ?? 0), 0) * 10) / 10;
  const maxGlycemic = meals.reduce((max, meal) => Math.max(max, meal.glycemic_load_estimate ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="text-sm text-zinc-400">
        Domínio dedicado à alimentação — dashboard só antecipa resumo; aqui está o trabalho fino.
      </p>
      <QuickExtrasCard />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-2xl">{totalCarbs} g</CardTitle>
            <CardDescription>carboidratos hoje{demoMode ? " (demo)" : ""}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-2xl">{meals.length}</CardTitle>
            <CardDescription>refeições hoje{demoMode ? " (demo)" : ""}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-2xl text-emerald-300">{maxGlycemic || "—"}</CardTitle>
            <CardDescription>maior carga glicêmica hoje{demoMode ? " (demo)" : ""}</CardDescription>
          </CardHeader>
        </Card>
      </div>
      <SectionCards
        items={[
          {
            title: "Refeições",
            description: "Diário e edição por refeição.",
            href: "/alimentacao/refeicoes",
          },
          {
            title: "Plano alimentar",
            description: "Objetivos, substituições e compensações.",
            href: "/alimentacao/plano",
          },
          {
            title: "Análise por foto",
            description: "IA + confirmação do usuário.",
            href: "/alimentacao/foto",
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {demoMode ? "Resumo narrativo da demo" : "Refeições de hoje"}
          </CardTitle>
          <CardDescription>
            {demoMode
              ? "Refeições simuladas para demonstrar como o GLYX liga carboidratos, glicemia e exercício."
              : "O que você já registrou hoje, incluindo os extras."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {meals.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma refeição registrada ainda hoje.</p>
          ) : (
            meals.map((meal) => (
              <div key={meal.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <p className="font-medium text-zinc-100">{meal.name}</p>
                <p className="text-xs text-zinc-500">
                  {meal.carbs_g ?? 0} g carb · {meal.protein_g ?? 0} g proteína · {meal.calories ?? 0} kcal
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
