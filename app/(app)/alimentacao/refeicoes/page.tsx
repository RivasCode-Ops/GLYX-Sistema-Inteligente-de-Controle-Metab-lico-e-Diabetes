import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { addMeal, deleteMeal } from "@/app/actions/meals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Meal } from "@/types/database";
import { demoMeals } from "@/lib/demo/data";

export default async function AlimentacaoRefeicoesPage() {
  let meals: Meal[] = [];
  const demoMode = !isSupabaseConfigured();

  async function addMealAction(formData: FormData): Promise<void> {
    "use server";
    await addMeal(formData);
  }

  async function deleteMealAction(formData: FormData): Promise<void> {
    "use server";
    await deleteMeal(formData);
  }

  if (demoMode) {
    meals = demoMeals;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("meals")
          .select("*")
          .eq("user_id", user.id)
          .order("eaten_at", { ascending: false })
          .limit(30);
        meals = (data ?? []) as Meal[];
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova refeição</CardTitle>
          <CardDescription>Registro manual — ou use análise por foto.</CardDescription>
        </CardHeader>
        <CardContent>
          {demoMode ? (
            <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              Demo pública: a lista abaixo usa refeições fictícias e o formulário ilustra o fluxo sem
              gravar dados reais.
            </p>
          ) : null}
          <form action={addMealAction} className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" required placeholder="ex.: Almoço" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="calories">Calorias</Label>
              <Input id="calories" name="calories" type="number" min={0} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="carbs_g">Carboidratos (g)</Label>
              <Input id="carbs_g" name="carbs_g" type="number" step="0.1" min={0} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="protein_g">Proteína (g)</Label>
              <Input id="protein_g" name="protein_g" type="number" step="0.1" min={0} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="fat_g">Gordura (g)</Label>
              <Input id="fat_g" name="fat_g" type="number" step="0.1" min={0} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Salvar refeição</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recentes</h2>
        {meals.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma refeição registrada.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
            {meals.map((m) => (
              <li key={m.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-zinc-200">{m.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-zinc-500">
                      {new Date(m.eaten_at).toLocaleString("pt-BR")}
                    </span>
                    {!demoMode ? (
                      <form action={deleteMealAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          aria-label={`Excluir refeição ${m.name}`}
                          title="Excluir"
                          className="rounded-md px-1.5 py-0.5 text-xs text-zinc-600 transition hover:bg-red-950/50 hover:text-red-300"
                        >
                          ✕
                        </button>
                      </form>
                    ) : null}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {m.carbs_g != null ? `${m.carbs_g} g carb` : "—"} ·{" "}
                  {m.calories != null ? `${m.calories} kcal` : "— kcal"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
