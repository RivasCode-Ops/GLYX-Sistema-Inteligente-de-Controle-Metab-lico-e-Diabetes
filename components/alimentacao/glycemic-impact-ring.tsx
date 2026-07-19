import { glycemicTier, GLYCEMIC_TIER_LABEL, type GlycemicTier } from "@/lib/health/glycemic-tier";

const TIER_STYLE: Record<GlycemicTier, { badge: string; stroke: string }> = {
  baixo: { badge: "bg-emerald-500 text-emerald-950", stroke: "#34d399" },
  medio: { badge: "bg-amber-500 text-amber-950", stroke: "#f0b429" },
  alto: { badge: "bg-red-500 text-red-950", stroke: "#f87171" },
};

type Props = {
  /** Carga glicêmica estimada, escala 0-100. */
  score: number | null;
};

export function GlycemicImpactRing({ score }: Props) {
  const clamped = score != null ? Math.max(0, Math.min(100, score)) : null;
  const tier = clamped != null ? glycemicTier(clamped) : null;
  const style = tier ? TIER_STYLE[tier] : null;
  const label = tier ? GLYCEMIC_TIER_LABEL[tier] : null;

  const r = 34;
  const circumference = 2 * Math.PI * r;
  const offset = clamped != null ? circumference * (1 - clamped / 100) : circumference;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 80 80" className="h-[76px] w-[76px] shrink-0" role="img" aria-label={
        clamped != null ? `Impacto glicêmico estimado: ${clamped} de 100, ${label}` : "Impacto glicêmico não estimado"
      }>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#27272a" strokeWidth={8} />
        {clamped != null ? (
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={style!.stroke}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 40 40)"
          />
        ) : null}
        <text x="40" y="37" textAnchor="middle" fontSize="20" fontWeight={500} fill="#f4f4f5" fontFamily="var(--font-mono, monospace)">
          {clamped ?? "—"}
        </text>
        <text x="40" y="51" textAnchor="middle" fontSize="9" fill="#a1a1aa">
          de 100
        </text>
      </svg>
      <div className="flex-1">
        {style ? (
          <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-medium ${style.badge}`}>
            {label}
          </span>
        ) : (
          <span className="inline-block rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
            Sem estimativa
          </span>
        )}
        <p className="mt-1.5 text-xs text-zinc-500">
          Estimativa de carga glicêmica do prato, não é uma previsão de glicemia.
        </p>
      </div>
    </div>
  );
}
