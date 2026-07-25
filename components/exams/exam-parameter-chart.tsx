import type { ExamParameterSeries } from "@/lib/exams/parameter-series";
import { parseReferenceRange } from "@/lib/exams/parameter-series";

const STATUS_COLOR: Record<string, string> = {
  normal: "#34d399",
  atencao: "#fbbf24",
  alterado: "#f87171",
};

/**
 * Evolução de UM parâmetro de exame (ex.: colesterol, HbA1c) ao longo dos
 * laudos salvos — SVG server-rendered, no mesmo estilo do WeightChart, sem
 * dependência de libs de gráfico no cliente.
 */
export function ExamParameterChart({ series }: { series: ExamParameterSeries }) {
  const { points } = series;
  if (points.length < 2) return null;

  const W = 560;
  const H = 120;
  const PAD = 8;

  const range = parseReferenceRange(series.referenceRange);
  const values = points.map((p) => p.value);
  if (range) values.push(range[0], range[1]);
  const min = Math.min(...values) * 0.95;
  const max = Math.max(...values) * 1.05;
  const span = Math.max(max - min, 0.001);

  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(points.length - 1, 1);
  const y = (v: number) => H - PAD - ((v - min) * (H - 2 * PAD)) / span;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const delta = Math.round((last.value - first.value) * 100) / 100;
  const lastColor = STATUS_COLOR[last.status] ?? STATUS_COLOR.normal;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-zinc-300">
          {series.parameter}
          {series.unit ? <span className="text-zinc-500"> ({series.unit})</span> : null}
        </span>
        <span className="text-zinc-500">
          {new Date(first.date).toLocaleDateString("pt-BR")} → {new Date(last.date).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950/50"
        role="img"
        aria-label={`Evolução de ${series.parameter}: de ${first.value} para ${last.value}${series.unit ? " " + series.unit : ""}`}
      >
        {range ? (
          <rect
            x={PAD}
            y={y(range[1])}
            width={W - 2 * PAD}
            height={Math.max(y(range[0]) - y(range[1]), 0)}
            fill="#34d399"
            fillOpacity={0.08}
          />
        ) : null}
        <path d={path} fill="none" stroke="#38bdf8" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.value)}
            r={i === points.length - 1 ? 4 : 2.5}
            fill={i === points.length - 1 ? lastColor : "#38bdf8"}
          />
        ))}
        <text x={x(points.length - 1) - 6} y={y(last.value) - 8} textAnchor="end" fontSize={11} fill="#e4e4e7">
          {last.raw}
        </text>
      </svg>
      <p className="mt-1 text-[11px] text-zinc-500">
        {delta === 0 ? "sem variação" : `${delta > 0 ? "+" : ""}${delta} desde o primeiro registro`}
      </p>
    </div>
  );
}
