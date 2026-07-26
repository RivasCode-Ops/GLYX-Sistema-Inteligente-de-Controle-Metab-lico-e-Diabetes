import type { DashboardBar } from "@/lib/body/dashboard";

const TONE_BY_PERCENT = (percent: number): string => {
  if (percent >= 80) return "bg-emerald-400";
  if (percent >= 50) return "bg-sky-400";
  if (percent >= 25) return "bg-amber-400";
  return "bg-zinc-500";
};

/**
 * Barras do painel. Cada uma mostra a própria definição embaixo — barra de
 * progresso sem definição é a forma mais fácil de mentir com dado, e aqui a
 * régua muda de barra pra barra (meta, recuperação, carga, minutos).
 */
export function DashboardBars({ bars }: { bars: DashboardBar[] }) {
  return (
    <div className="space-y-3">
      {bars.map((bar) => (
        <div key={bar.key}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-zinc-200">{bar.label}</span>
            <span className={bar.percent == null ? "text-xs text-zinc-500" : "font-semibold text-zinc-100"}>
              {bar.percent == null ? "sem dado" : `${bar.percent}%`}
            </span>
          </div>
          <div
            className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-800"
            role="img"
            aria-label={`${bar.label}: ${bar.percent == null ? "sem dado suficiente" : `${bar.percent} por cento`}`}
          >
            {bar.percent != null ? (
              <div
                className={`h-full rounded-full ${TONE_BY_PERCENT(bar.percent)}`}
                style={{ width: `${bar.percent}%` }}
              />
            ) : null}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            {bar.percent == null ? (bar.missing ?? bar.definition) : bar.definition}
          </p>
        </div>
      ))}
    </div>
  );
}
