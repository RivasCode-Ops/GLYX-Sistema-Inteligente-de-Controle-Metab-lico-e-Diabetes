import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { QuickReadingDialog } from "@/components/dashboard/quick-reading-dialog";
import { Sparkline } from "@/components/dashboard/sparkline";
import { cn } from "@/lib/utils";

type Props = {
  latestGlucose: number | null;
  glucoseSeries: number[];
  riskLabel: string;
  carbsToday: number;
  activeMinutes: number;
  waterMl: number;
  waterGoalMl: number;
};

const RISK_STYLE: Record<string, { pill: string; text: string; stroke: string }> = {
  "Atenção": { pill: "bg-red-500/15 text-red-300", text: "text-red-300", stroke: "#f87171" },
  Moderado: { pill: "bg-amber-500/15 text-amber-300", text: "text-amber-300", stroke: "#fbbf24" },
  Baixo: { pill: "bg-emerald-500/15 text-emerald-300", text: "text-emerald-300", stroke: "#34d399" },
};

export function GlucoseHeroCard({
  latestGlucose,
  glucoseSeries,
  riskLabel,
  carbsToday,
  activeMinutes,
  waterMl,
  waterGoalMl,
}: Props) {
  const trend =
    latestGlucose != null && latestGlucose >= 140
      ? "up"
      : latestGlucose != null && latestGlucose < 100
        ? "down"
        : "stable";
  const style =
    RISK_STYLE[riskLabel] ?? { pill: "bg-zinc-800 text-zinc-400", text: "text-zinc-400", stroke: "#71717a" };
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;

  return (
    <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-950/40 to-zinc-950/40">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] uppercase tracking-wide text-emerald-300/80">Glicemia atual</p>
          {latestGlucose != null ? (
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", style.pill)}>
              {riskLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-4xl text-zinc-50">{latestGlucose ?? "—"}</span>
          <span className="text-xs text-zinc-500">
            {latestGlucose != null ? "mg/dL" : "Registre uma leitura"}
          </span>
          {latestGlucose != null ? (
            <span className={cn("ml-auto flex items-center gap-1 text-xs", style.text)}>
              <TrendIcon className="h-3.5 w-3.5" aria-hidden />
              {trend === "up" ? "acima da meta" : trend === "down" ? "abaixo da meta" : "estável"}
            </span>
          ) : null}
        </div>

        {glucoseSeries.length >= 2 ? (
          <Sparkline values={glucoseSeries} stroke={style.stroke} className="mt-2 h-9 w-full" />
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-zinc-800/80 pt-4">
          <div>
            <p className="text-[11px] text-zinc-500">Carboidratos</p>
            <p className="mt-0.5 font-mono text-sm text-zinc-200">{carbsToday}g</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">Atividade</p>
            <p className="mt-0.5 font-mono text-sm text-zinc-200">{activeMinutes} min</p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">Água</p>
            <p className="mt-0.5 font-mono text-sm text-zinc-200">
              {waterMl}/{waterGoalMl}ml
            </p>
          </div>
        </div>

        <div className="mt-4">
          <QuickReadingDialog />
        </div>
      </div>
    </Card>
  );
}
