import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { deleteMeal } from "@/app/actions/meals";
import { startOfLocalDayISO } from "@/lib/time/local-day";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewMealForm } from "@/components/alimentacao/new-meal-form";
import { WaterCard } from "@/components/dashboard/water-card";
import { DayProgressRing } from "@/components/alimentacao/day-progress-ring";
import { getNutritionToday } from "@/lib/queries/nutrition-today";
import { GOAL_LABEL, PROTEIN_G_PER_KG } from "@/lib/health/energy";
import type { Meal } from "@/types/database";
import { demoMeals } from "@/lib/demo/data";
import { formatarDataHora } from "@/lib/time/format";

// Visão geral + Refeições fundidas numa tela só: antes uma relistava o que a
// outra mostrava, e cada uma tinha seu próprio formulário de adicionar com a
// mesma estimativa por IA. Agora: resumo de hoje no topo, um registro único
// (NewMealForm cobre o "extra rápido"), atalhos para foto/montar prato e o
// diário embaixo.
export default async function AlimentacaoPage() {
  let meals: Meal[] = [];
  let todayStartISO = startOfLocalDayISO(null);
  const demoMode = !isSupabaseConfigured();
  const photoUrls = new Map<string, string>();
  const nutricao = await getNutritionToday();

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
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .maybeSingle();
        todayStartISO = startOfLocalDayISO(profile?.timezone);

        const { data } = await supabase
          .from("meals")
          .select("*")
          .eq("user_id", user.id)
          .order("eaten_at", { ascending: false })
          .limit(30);
        meals = (data ?? []) as Meal[];

        const paths = meals.map((m) => m.photo_path).filter((p): p is string => Boolean(p));
        if (paths.length) {
          const { data: signed } = await supabase.storage
            .from("meal-photos")
            .createSignedUrls(paths, 3600);
          for (const s of signed ?? []) {
            if (s.signedUrl && s.path) photoUrls.set(s.path, s.signedUrl);
          }
        }
      }
    }
  }

  // Em demo, as refeições fictícias contam como "hoje" para os tiles fazerem sentido.
  const todayMeals = demoMode ? meals : meals.filter((m) => m.eaten_at >= todayStartISO);
  // Macros de hoje somados das MESMAS refeições que a lista abaixo mostra.
  const consumidoHoje = todayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories ?? 0),
      carbs_g: acc.carbs_g + (m.carbs_g ?? 0),
      protein_g: acc.protein_g + (m.protein_g ?? 0),
      fat_g: acc.fat_g + (m.fat_g ?? 0),
    }),
    { calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }
  );
  const maxGlycemic = todayMeals.reduce((max, m) => Math.max(max, m.glycemic_load_estimate ?? 0), 0);

  // Uma vez, aqui: o tile e a nota abaixo dele leem a MESMA string. Dois
  // `toFixed` em lugares diferentes acabam divergindo no dia em que um deles
  // ganhar uma casa decimal.
  const proteinaPorKg =
    nutricao.weightKg && nutricao.weightKg > 0
      ? `${(consumidoHoje.protein_g / nutricao.weightKg).toFixed(1)} g/kg`
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Quatro macros do dia, com a mesma leitura do painel de nutrição. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: "kcal consumidas", valor: Math.round(consumidoHoje.calories), cor: "text-zinc-100", nota: null },
          { rotulo: "carboidratos", valor: `${Math.round(consumidoHoje.carbs_g)} g`, cor: "text-amber-300", nota: null },
          {
            rotulo: "proteínas",
            valor: `${Math.round(consumidoHoje.protein_g)} g`,
            cor: "text-sky-300",
            // Gramas sozinhas não respondem se está adequado: a referência de
            // proteína existe em g/kg, e é a razão que se compara. Sem peso
            // registrado a linha some, em vez de o app inventar um peso.
            nota: proteinaPorKg,
          },
          { rotulo: "gorduras", valor: `${Math.round(consumidoHoje.fat_g)} g`, cor: "text-purple-300", nota: null },
        ].map((t) => (
          <div key={t.rotulo} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <p className={`font-mono text-2xl ${t.cor}`}>{t.valor}</p>
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">{t.rotulo}</p>
            {t.nota ? <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{t.nota}</p> : null}
          </div>
        ))}
      </div>

      {proteinaPorKg && nutricao.bodyGoal ? (
        <p className="-mt-4 text-[11px] leading-relaxed text-zinc-500">
          Alvo de {PROTEIN_G_PER_KG[nutricao.bodyGoal].toFixed(1)} g/kg para{" "}
          {GOAL_LABEL[nutricao.bodyGoal].toLowerCase()}, sobre {nutricao.weightKg} kg. É faixa geral
          para pessoa fisicamente ativa — condição renal, hepática ou medicação que mude a demanda
          proteica pedem meta feita por nutricionista.
        </p>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          {nutricao.macroTargets ? (
            <DayProgressRing
              consumed={consumidoHoje.calories}
              target={nutricao.macroTargets.calories}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-200">Progresso do dia</p>
            {nutricao.macroTargets ? (
              <p className="font-mono text-sm text-zinc-400">
                {Math.round(consumidoHoje.calories)} de {nutricao.macroTargets.calories} kcal
              </p>
            ) : (
              // Sem os dados corporais não há meta calculada — e o app não
              // inventa uma. A frase diz onde resolver, em vez de mostrar um
              // número que ninguém definiu.
              <p className="text-xs text-zinc-500">
                Complete sexo, idade, altura, peso e nível de atividade no Perfil para calcular sua
                meta diária.
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-500">
              {todayMeals.length} refeição(ões) hoje
              {maxGlycemic ? ` · maior carga glicêmica ${maxGlycemic}` : ""}
              {demoMode ? " (demo)" : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Água e bebidas vieram do Painel metabólico: o painel é vista breve do
          que fazer agora, e registro mora no módulo.

          Os medidores de macro que vieram junto saíram: os quatro tiles acima e o
          mesma coisa, e duas leituras do mesmo número na mesma tela é o defeito
          que este app já pagou três vezes. Bebidas ficam, porque são grandeza
          própria e não aparecem em lugar nenhum acima. */}
      {!demoMode ? (
        <WaterCard
          todayMl={nutricao.waterMl}
          goalMl={nutricao.waterGoalMl}
          extras={nutricao.beverageExtras}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar refeição</CardTitle>
          <CardDescription>
            Manual (com estimativa por IA) — ou registre por foto / monte o prato abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {demoMode ? (
            <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              Demo pública: o formulário ilustra o fluxo sem gravar dados reais.
            </p>
          ) : null}
          <NewMealForm />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/alimentacao/foto"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:border-emerald-500/50 hover:text-emerald-200"
            >
              📷 Registrar por foto
            </Link>
            <Link
              href="/alimentacao/montar-prato"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:border-emerald-500/50 hover:text-emerald-200"
            >
              🧩 Montar prato (IA)
            </Link>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recentes</h2>
        {meals.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma refeição registrada.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900/30">
            {meals.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                {m.photo_path && photoUrls.get(m.photo_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrls.get(m.photo_path)}
                    alt={`Foto de ${m.name ?? "refeição"}`}
                    className="h-12 w-12 shrink-0 rounded-lg border border-zinc-800 object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-2 font-medium text-zinc-200">
                      {m.name}
                      {m.glucose_spike ? (
                        <span
                          title="Glicemia subiu bastante nas 2h após esta refeição"
                          className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-normal text-amber-300"
                        >
                          ⚡ pico glicêmico
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-xs text-zinc-500">
                        {formatarDataHora(m.eaten_at)}
                      </span>
                      {!demoMode ? (
                        <form action={deleteMealAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <button
                            type="submit"
                            aria-label={`Excluir refeição ${m.name}`}
                            title="Excluir"
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm text-zinc-600 transition hover:bg-red-950/50 hover:text-red-300"
                          >
                            ✕
                          </button>
                        </form>
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {m.carbs_g != null ? `${m.carbs_g}g carb` : "— carb"} ·{" "}
                    {m.protein_g != null ? `${m.protein_g}g prot` : "— prot"} ·{" "}
                    {m.fat_g != null ? `${m.fat_g}g gord` : "— gord"} ·{" "}
                    {m.calories != null ? `${m.calories} kcal` : "— kcal"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
