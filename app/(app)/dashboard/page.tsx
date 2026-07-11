import { isSupabaseConfigured } from "@/lib/env";
import { getDashboardSummary } from "@/lib/queries/dashboard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DashboardDemo } from "@/components/dashboard/dashboard-demo";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return <DashboardDemo />;
  }

  const summary = await getDashboardSummary();
  if (!summary) {
    return <DashboardDemo />;
  }

  return (
    <DashboardShell
      latestGlucose={summary.latestGlucose}
      carbsToday={summary.carbsToday}
      activeMinutes={summary.activeMinutes}
      riskLabel={summary.riskLabel}
      alerts={summary.alerts}
      stepsToday={summary.stepsToday}
      sleepHoursToday={summary.sleepHoursToday}
    />
  );
}
