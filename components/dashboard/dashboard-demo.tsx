import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { demoAlerts, demoSummary } from "@/lib/demo/data";
import { readingAge } from "@/lib/health/reading-freshness";

/** Painel sem Supabase ou sem sessão persistida */
export function DashboardDemo() {
  const idade = demoSummary.latestGlucoseAt ? readingAge(demoSummary.latestGlucoseAt) : null;
  return (
    <DashboardShell
      latestGlucose={demoSummary.latestGlucose}
      latestGlucoseAgeLabel={idade?.label ?? null}
      latestGlucoseFreshness={idade?.freshness ?? null}
      glucoseTrend={demoSummary.glucoseTrend}
      glucoseSeries={demoSummary.glucoseSeries}
      carbsToday={demoSummary.carbsToday}
      activeMinutes={demoSummary.activeMinutes}
      waterMl={600}
      waterGoalMl={2000}
      riskLabel={demoSummary.riskLabel}
      alerts={demoAlerts}
      stepsToday={demoSummary.stepsToday}
      sleepHoursToday={demoSummary.sleepHoursToday}
    />
  );
}
