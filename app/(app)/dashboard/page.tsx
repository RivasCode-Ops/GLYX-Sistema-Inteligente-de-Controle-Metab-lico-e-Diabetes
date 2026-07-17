import { redirect } from "next/navigation";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getDashboardSummary } from "@/lib/queries/dashboard";
import { startOfLocalDayISO } from "@/lib/time/local-day";
import { getLastTrainedByMuscleGroup, getActiveMusclePauses } from "@/lib/queries/muscle-recovery";
import { computeMuscleRecovery, suggestMuscleFocus } from "@/lib/exercicios/muscle-recovery";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardDemo } from "@/components/dashboard/dashboard-demo";
import { DashboardAutoRefresh } from "@/components/dashboard/auto-refresh";
import { SensorRadar } from "@/components/glicemia/sensor-radar";
import { WaterCard, type BeverageSummary } from "@/components/dashboard/water-card";
import { isHydrating, isBeverageKind } from "@/lib/health/beverages";
import { MacroGaugesCard } from "@/components/alimentacao/macro-gauge";
import { dailyTargets } from "@/lib/health/energy";
import type { ActivityLevel, BodyGoal, Sex } from "@/lib/health/energy";

const FOCUS_STRIP: Record<
  "diabetes" | "lose" | "gain",
  { label: string; actions: { title: string; href: string }[] }
> = {
  diabetes: {
    label: "🩸 Foco: controle do diabetes",
    actions: [
      { title: "Registrar glicemia", href: "/glicemia" },
      { title: "Medicação de hoje", href: "/medicacao" },
      { title: "Foto da refeição", href: "/alimentacao/foto" },
    ],
  },
  lose: {
    label: "⚖️ Foco: emagrecer com segurança",
    actions: [
      { title: "Foto da refeição", href: "/alimentacao/foto" },
      { title: "Registrar peso", href: "/perfil" },
      { title: "Montar prato", href: "/alimentacao/montar-prato" },
    ],
  },
  gain: {
    label: "💪 Foco: ganhar massa muscular",
    actions: [
      { title: "Treino de hoje", href: "/exercicios" },
      { title: "Montar prato", href: "/alimentacao/montar-prato" },
      { title: "Registrar peso", href: "/perfil" },
    ],
  },
};

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return <DashboardDemo />;
  }

  type Focus = "diabetes" | "lose" | "gain";
  let focus: Focus | null = null;
  let waterMl = 0;
  let waterGoalMl = 2000;
  let beverageExtras: BeverageSummary[] = [];
  let macroConsumed: { calories: number; carbs_g: number; protein_g: number; fat_g: number } | null =
    null;
  let macroTargets: { calories: number; carbs_g: number; protein_g: number; fat_g: number } | null =
    null;
  let muscleFocusLabel: string | null = null;

  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase
        .from("profiles")
        .select(
          "onboarding_done, primary_focus, sex, birth_year, height_cm, activity_level, body_goal, timezone"
        )
        .eq("id", user.id)
        .maybeSingle();
      const startOfDayISO = startOfLocalDayISO(p?.timezone);

      const [waterRes, mealsRes, weightRes, lastTrainedByGroup, pausedGroups] = await Promise.all([
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
        getLastTrainedByMuscleGroup(),
        getActiveMusclePauses(),
      ]);

      const muscleFocus = suggestMuscleFocus(computeMuscleRecovery(lastTrainedByGroup, pausedGroups));
      if (muscleFocus) {
        muscleFocusLabel =
          muscleFocus.status === "never" ? `Comece: ${muscleFocus.label}` : `${muscleFocus.label} pronto(a)`;
      }

      if (p && !p.onboarding_done) redirect("/bem-vindo");
      focus = (p?.primary_focus as Focus | null) ?? null;

      // Só bebidas hidratantes contam pra meta; o resto vira o resumo de extras.
      const beverageRows = (waterRes.data ?? []) as { amount_ml: number | null; kind: string | null }[];
      waterMl = beverageRows
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
      beverageExtras = [...extrasMap.values()];
      const weightKg = weightRes.data?.weight_kg ? Number(weightRes.data.weight_kg) : null;
      if (weightKg) waterGoalMl = Math.round(weightKg * 35);

      macroConsumed = (mealsRes.data ?? []).reduce(
        (acc, m) => ({
          calories: acc.calories + (m.calories ?? 0),
          carbs_g: acc.carbs_g + (m.carbs_g ?? 0),
          protein_g: acc.protein_g + (m.protein_g ?? 0),
          fat_g: acc.fat_g + (m.fat_g ?? 0),
        }),
        { calories: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }
      );

      if (p?.sex && p.birth_year && p.height_cm && p.activity_level && weightKg) {
        const targets = dailyTargets(
          {
            sex: p.sex as Sex,
            age: new Date().getFullYear() - p.birth_year,
            heightCm: p.height_cm,
            weightKg,
            activity: p.activity_level as ActivityLevel,
          },
          (p.body_goal as BodyGoal | null) ?? "maintain"
        );
        macroTargets = targets;
      }
    }
  }

  const summary = await getDashboardSummary();
  if (!summary) {
    return <DashboardDemo />;
  }

  const strip = focus ? FOCUS_STRIP[focus] : null;

  return (
    <div className="space-y-6">
      <DashboardAutoRefresh />
      <SensorRadar />
      {strip ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium text-emerald-200">{strip.label}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {strip.actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-emerald-500/50 hover:text-emerald-200"
              >
                {a.title} →
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <DashboardShell
        latestGlucose={summary.latestGlucose}
        glucoseSeries={summary.glucoseSeries}
        carbsToday={summary.carbsToday}
        activeMinutes={summary.activeMinutes}
        waterMl={waterMl}
        waterGoalMl={waterGoalMl}
        riskLabel={summary.riskLabel}
        alerts={summary.alerts}
        stepsToday={summary.stepsToday}
        sleepHoursToday={summary.sleepHoursToday}
        muscleFocusLabel={muscleFocusLabel}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <WaterCard todayMl={waterMl} goalMl={waterGoalMl} extras={beverageExtras} />
        {macroConsumed && macroTargets ? (
          <MacroGaugesCard consumed={macroConsumed} targets={macroTargets} />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/mapa-risco"
          className="block rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-zinc-300 transition hover:border-emerald-500/40 hover:text-zinc-100"
        >
          Mapa de risco — auditoria metabólica do seu período →
        </Link>
        <Link
          href="/status"
          className="block rounded-2xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-400 transition hover:border-emerald-500/40 hover:text-zinc-200"
        >
          Auditoria do sistema — o que está funcionando →
        </Link>
      </div>
    </div>
  );
}
