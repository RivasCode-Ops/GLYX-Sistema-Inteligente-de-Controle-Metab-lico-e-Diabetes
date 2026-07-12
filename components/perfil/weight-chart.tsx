import type { WeightLog } from "@/types/database";

/**
 * Linha de evolução do peso (SVG server-rendered, sem libs).
 * Mostra até 20 pesagens em ordem cronológica com a meta como referência.
 */
export function WeightChart({
  logs,
  targetKg,
}: {
  logs: WeightLog[];
  targetKg?: number | null;
}) {
  if (logs.length < 2) return null;

  const points = [...logs]
    .sort((a, b) => (a.logged_on < b.logged_on ? -1 : 1))
    .map((l) => ({ kg: Number(l.weight_kg), on: l.logged_on }));

  const W = 560;
  const H = 120;
  const PAD = 8;

  const values = points.map((p) => p.kg);
  if (targetKg) values.push(Number(targetKg));
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;
  const range = Math.max(max - min, 1);

  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(points.length - 1, 1);
  const y = (kg: number) => H - PAD - ((kg - min) * (H - 2 * PAD)) / range;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const delta = Math.round((last.kg - first.kg) * 10) / 10;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-zinc-500">
          {first.on.slice(5).replace("-", "/")} → {last.on.slice(5).replace("-", "/")}
        </span>
        <span className={delta <= 0 ? "text-emerald-400" : "text-amber-400"}>
          {delta > 0 ? "+" : ""}
          {delta} kg no período
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950/50"
        role="img"
        aria-label={`Evolução do peso: de ${first.kg} para ${last.kg} kg`}
      >
        {targetKg ? (
          <>
            <line
              x1={PAD}
              x2={W - PAD}
              y1={y(Number(targetKg))}
              y2={y(Number(targetKg))}
              stroke="#34d399"
              strokeOpacity={0.35}
              strokeDasharray="4 4"
            />
            <text x={W - PAD} y={y(Number(targetKg)) - 4} textAnchor="end" fontSize={10} fill="#34d399" fillOpacity={0.7}>
              meta {targetKg} kg
            </text>
          </>
        ) : null}
        <path d={path} fill="none" stroke="#38bdf8" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.on} cx={x(i)} cy={y(p.kg)} r={i === points.length - 1 ? 4 : 2.5} fill="#38bdf8" />
        ))}
        <text x={x(points.length - 1) - 6} y={y(last.kg) - 8} textAnchor="end" fontSize={11} fill="#e4e4e7">
          {last.kg} kg
        </text>
      </svg>
    </div>
  );
}
