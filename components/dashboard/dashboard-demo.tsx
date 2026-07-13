import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { demoAlerts, demoSummary } from "@/lib/demo/data";

/** Painel sem Supabase ou sem sessão persistida */
export function DashboardDemo() {
  return (
    <DashboardShell
      latestGlucose={demoSummary.latestGlucose}
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
