import { SectionCards } from "@/components/module/section-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuickExtrasCard } from "@/components/alimentacao/quick-extras-card";
import { demoMeals } from "@/lib/demo/data";

export default function AlimentacaoOverviewPage() {
  const totalCarbs = demoMeals.reduce((sum, meal) => sum + (meal.carbs_g ?? 0), 0);

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
            <CardDescription>carboidratos no cenário demo</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-2xl">3</CardTitle>
            <CardDescription>refeições exemplo</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-mono text-2xl text-emerald-300">21</CardTitle>
            <CardDescription>maior carga glicêmica estimada</CardDescription>
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
          <CardTitle className="text-base">Resumo narrativo da demo</CardTitle>
          <CardDescription>
            Refeições simuladas para demonstrar como o GLYX liga carboidratos, glicemia e exercício.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {demoMeals.map((meal) => (
            <div key={meal.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="font-medium text-zinc-100">{meal.name}</p>
              <p className="text-xs text-zinc-500">
                {meal.carbs_g} g carb · {meal.protein_g} g proteína · {meal.calories} kcal
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
