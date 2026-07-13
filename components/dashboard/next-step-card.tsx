import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getNextStepInsight, type NextStepTone } from "@/lib/insights/next-step";
import { cn } from "@/lib/utils";

type Props = {
  latestGlucose: number | null;
  carbsToday: number;
  activeMinutes: number;
};

const TONE_ICON: Record<NextStepTone, string> = {
  danger: "text-red-400",
  warning: "text-amber-400",
  success: "text-emerald-400",
  neutral: "text-sky-400",
};

export function NextStepCard({ latestGlucose, carbsToday, activeMinutes }: Props) {
  const insight = getNextStepInsight({ latestGlucose, carbsToday, activeMinutes });

  return (
    <Card>
      <div className="flex items-start gap-3 p-4">
        <Lightbulb className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_ICON[insight.tone])} aria-hidden />
        <div className="flex-1">
          <p className="text-sm leading-relaxed text-zinc-200">{insight.text}</p>
          <Link
            href={insight.actionHref}
            className="mt-2 inline-block rounded-lg border border-emerald-700/60 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10"
          >
            {insight.actionLabel} →
          </Link>
        </div>
      </div>
    </Card>
  );
}
