import { redirect } from "next/navigation";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getDashboardSummary } from "@/lib/queries/dashboard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardDemo } from "@/components/dashboard/dashboard-demo";

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
        carbsToday={summary.carbsToday}
        activeMinutes={summary.activeMinutes}
        riskLabel={summary.riskLabel}
        alerts={summary.alerts}
        stepsToday={summary.stepsToday}
        sleepHoursToday={summary.sleepHoursToday}
      />
    </div>
  );
}
