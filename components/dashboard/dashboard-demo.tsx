import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { demoAlerts, demoSummary } from "@/lib/demo/data";

/** Painel sem Supabase ou sem sessão persistida */
export function DashboardDemo() {
  return (
    <DashboardShell
      latestGlucose={demoSummary.latestGlucose}
      carbsToday={demoSummary.carbsToday}
      activeMinutes={demoSummary.activeMinutes}
      riskLabel={demoSummary.riskLabel}
      alerts={demoAlerts}
      stepsToday={demoSummary.stepsToday}
      sleepHoursToday={demoSummary.sleepHoursToday}
    />
  );
}
