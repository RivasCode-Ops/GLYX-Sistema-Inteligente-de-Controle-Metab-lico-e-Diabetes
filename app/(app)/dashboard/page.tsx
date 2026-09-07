import { redirect } from "next/navigation";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getDashboardSummary } from "@/lib/queries/dashboard";
import { getNutritionToday } from "@/lib/queries/nutrition-today";
import {
  getLastTrainedByMuscleGroup,
  getActiveMusclePauses,
  getSessionCountByMuscleGroup,
} from "@/lib/queries/muscle-recovery";
import { computeMuscleRecovery } from "@/lib/exercicios/muscle-recovery";
import { planSummaryLabel, suggestFromPlan } from "@/lib/exercicios/training-plan";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardDemo } from "@/components/dashboard/dashboard-demo";
import { DashboardAutoRefresh } from "@/components/dashboard/auto-refresh";
import { SensorRadar } from "@/components/glicemia/sensor-radar";

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
  let muscleFocusLabel: string | null = null;

  // Água e macros saíram do painel e foram para o módulo Alimentação, junto do
  // formulário que os preenche. O que fica aqui é só o que o card de glicemia
  // ainda mostra — e o cálculo é o mesmo dos dois lados, por função
  // compartilhada, em vez de duas contagens da mesma grandeza.
  const nutricao = await getNutritionToday();

  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase
        .from("profiles")
        .select("onboarding_done, primary_focus")
        .eq("id", user.id)
        .maybeSingle();

      const [lastTrainedByGroup, pausedGroups, logCounts] = await Promise.all([
        getLastTrainedByMuscleGroup(),
        getActiveMusclePauses(),
        getSessionCountByMuscleGroup(),
      ]);

      // Mesma fonte de verdade que /exercicios/plano — antes o dashboard
      // sugeria um músculo solto e a tela de plano outro treino, sem nenhuma
      // relação entre os dois.
      muscleFocusLabel = planSummaryLabel(
        suggestFromPlan(computeMuscleRecovery(lastTrainedByGroup, pausedGroups, new Date(), logCounts))
      );

      if (p && !p.onboarding_done) redirect("/bem-vindo");
      focus = (p?.primary_focus as Focus | null) ?? null;
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
      {/* O aviso de outra conta com acesso foi para Perfil → Conta. Ele é
          administrativo: não responde "o que eu faço agora", e ocupava a melhor
          posição da tela com um evento de um mês atrás. */}
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
        latestGlucoseAgeLabel={summary.latestGlucoseAgeLabel}
        latestGlucoseFreshness={summary.latestGlucoseFreshness}
        glucoseTrend={summary.glucoseTrend}
        glucoseSeries={summary.glucoseSeries}
        carbsToday={summary.carbsToday}
        activeMinutes={summary.activeMinutes}
        waterMl={nutricao.waterMl}
        waterGoalMl={nutricao.waterGoalMl}
        riskLabel={summary.riskLabel}
        targetRangeLabel={summary.targetRangeLabel}
        alerts={summary.alerts}
        stepsToday={summary.stepsToday}
        sleepHoursToday={summary.sleepHoursToday}
        muscleFocusLabel={muscleFocusLabel}
      />
      {/* Saíram daqui, e para onde foram:
          · card de água e bebidas  → módulo Alimentação (é registro, não decisão)
          · quatro medidores de macro → módulo Alimentação
          · link "Análise — auditoria" → removido: duplicava a linha do módulo
            Análise, que fica logo acima na mesma tela

          O painel é vista breve do que fazer agora. Detalhe e registro moram no
          módulo, alcançáveis pelo menu e pela própria lista MÓDULOS. */}
    </div>
  );
}
