import { ArrowDownRight, ArrowUpRight, Minus, Plug } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { QuickReadingDialog } from "@/components/dashboard/quick-reading-dialog";
import { InsulinQuickDialog } from "@/components/glicemia/insulin-quick-dialog";
import { Sparkline } from "@/components/dashboard/sparkline";
import type { Freshness } from "@/lib/health/reading-freshness";
import { cn } from "@/lib/utils";

type Props = {
  latestGlucose: number | null;
  /** Há quanto tempo essa leitura foi medida ("agora", "há 3 h", "há 20 dias"). */
  latestGlucoseAgeLabel: string | null;
  latestGlucoseFreshness: Freshness | null;
  /** Direção medida entre as duas últimas leituras; null quando não dá para afirmar. */
  glucoseTrend: "up" | "down" | "flat" | null;
  glucoseSeries: number[];
  riskLabel: string;
  /** Faixa alvo por extenso, ex. "70–140". */
  targetRangeLabel?: string | null;
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

const TREND_LABEL = { up: "subindo", down: "caindo", flat: "estável" } as const;

export function GlucoseHeroCard({
  latestGlucose,
  latestGlucoseAgeLabel,
  latestGlucoseFreshness,
  glucoseTrend,
  glucoseSeries,
  riskLabel,
  targetRangeLabel = null,
  carbsToday,
  activeMinutes,
  waterMl,
  waterGoalMl,
}: Props) {
  const velha = latestGlucoseFreshness === "stale";
  const agora = latestGlucoseFreshness === "fresh";
  const style =
    RISK_STYLE[riskLabel] ?? { pill: "bg-zinc-800 text-zinc-400", text: "text-zinc-400", stroke: "#71717a" };
  const TrendIcon =
    glucoseTrend === "up" ? ArrowUpRight : glucoseTrend === "down" ? ArrowDownRight : Minus;

  return (
    <Card
      className={cn(
        // Leitura velha não ganha a moldura verde de "está tudo em ordem".
        velha
          ? "border-zinc-700/60 bg-zinc-950/40"
          : "border-emerald-500/25 bg-gradient-to-br from-emerald-950/40 to-zinc-950/40"
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          {/* O rótulo é a afirmação principal do card: só diz "atual" o que é. */}
          <p
            className={cn(
              "text-[11px] uppercase tracking-wide",
              velha ? "text-zinc-400" : "text-emerald-300/80"
            )}
          >
            {agora ? "Glicemia atual" : "Última leitura"}
          </p>
          {/* A faixa vai AO LADO do badge, não dentro dele: `riskLabel` também é
              a chave de `RISK_STYLE`, então mudar o texto trocaria a cor junto.
              Sem a régua, "Moderado" é adjetivo — e a faixa é definida com o
              médico, então ela muda de pessoa para pessoa. */}
          {latestGlucose != null && riskLabel !== "—" ? (
            <span className="flex items-baseline gap-1.5">
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", style.pill)}>
                {riskLabel}
              </span>
              {targetRangeLabel ? (
                <span className="font-mono text-[11px] text-zinc-500">
                  meta {targetRangeLabel}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className={cn("font-mono text-4xl", velha ? "text-zinc-400" : "text-zinc-50")}>
            {latestGlucose ?? "—"}
          </span>
          <span className="text-xs text-zinc-500">
            {latestGlucose != null ? "mg/dL" : "Registre uma leitura"}
          </span>
          {/* A idade só some quando o número é do agora — em qualquer outro caso
              ela é parte da informação, não um detalhe. */}
          {latestGlucose != null && !agora && latestGlucoseAgeLabel ? (
            <span className={cn("text-xs", velha ? "text-amber-300" : "text-zinc-400")}>
              {latestGlucoseAgeLabel}
            </span>
          ) : null}
          {glucoseTrend ? (
            <span className={cn("ml-auto flex items-center gap-1 text-xs", style.text)}>
              <TrendIcon className="h-3.5 w-3.5" aria-hidden />
              {TREND_LABEL[glucoseTrend]}
            </span>
          ) : null}
        </div>

        {/* Sparkline de dado velho desenha uma linha que parece recente. */}
        {!velha && glucoseSeries.length >= 2 ? (
          <Sparkline values={glucoseSeries} stroke={style.stroke} className="mt-2 h-9 w-full" />
        ) : null}

        {velha ? (
          <Link
            href="/integracoes"
            className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/15"
          >
            <Plug className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Nenhuma leitura nova desde então. Conferir a conexão do sensor
            </span>
          </Link>
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

        <div className="mt-4 flex flex-wrap gap-2">
          <QuickReadingDialog />
          {/* O campo do diálogo se chama "Glicemia agora". Preenchê-lo com
              leitura que não é de agora seria oferecer, já digitado, o número
              errado para calcular dose. Só passa o que é do agora. */}
          <InsulinQuickDialog latestGlucose={agora ? latestGlucose : null} />
        </div>
      </div>
    </Card>
  );
}
