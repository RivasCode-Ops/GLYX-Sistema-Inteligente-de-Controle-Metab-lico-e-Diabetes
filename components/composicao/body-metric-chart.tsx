export type MetricPoint = { date: string; value: number };

/**
 * Evolução de uma medida ao longo do tempo — SVG renderizado no servidor, mesmo
 * padrão do gráfico de peso e do de exames (sem lib de gráfico no cliente).
 *
 * O eixo X é proporcional ao TEMPO, não à ordem dos pontos: medições espaçadas
 * de forma irregular (uma em janeiro, três em março) desenhariam uma reta
 * enganosa se cada ponto ocupasse a mesma largura.
 */
export function BodyMetricChart({
  label,
  unit,
  points,
  target,
}: {
  label: string;
  unit: string;
  points: MetricPoint[];
  target?: number | null;
}) {
  if (points.length < 2) return null;

  const W = 560;
  const H = 120;
  const PAD = 10;

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const times = sorted.map((p) => new Date(`${p.date}T12:00:00Z`).getTime());
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const tSpan = Math.max(tMax - tMin, 1);

  const values = sorted.map((p) => p.value);
  if (target != null) values.push(target);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const pad = Math.max((vMax - vMin) * 0.15, 0.5);
  const min = vMin - pad;
  const max = vMax + pad;
  const span = Math.max(max - min, 0.001);

  const x = (i: number) => PAD + ((times[i] - tMin) / tSpan) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - min) * (H - 2 * PAD)) / span;

  const path = sorted
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const delta = Math.round((last.value - first.value) * 10) / 10;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-zinc-300">
          {label} <span className="text-zinc-500">({unit})</span>
        </span>
        <span className="text-zinc-500">
          {new Date(`${first.date}T12:00:00Z`).toLocaleDateString("pt-BR")} →{" "}
          {new Date(`${last.date}T12:00:00Z`).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950/50"
        role="img"
        aria-label={`Evolução de ${label}: de ${first.value} para ${last.value} ${unit}`}
      >
        {target != null ? (
          <>
            <line
              x1={PAD}
              x2={W - PAD}
              y1={y(target)}
              y2={y(target)}
              stroke="#34d399"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text x={W - PAD} y={y(target) - 4} textAnchor="end" fontSize={10} fill="#34d399">
              meta {target}
            </text>
          </>
        ) : null}
        <path d={path} fill="none" stroke="#38bdf8" strokeWidth={2} strokeLinejoin="round" />
        {sorted.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.value)}
            r={i === sorted.length - 1 ? 4 : 2.5}
            fill="#38bdf8"
          />
        ))}
        <text x={x(sorted.length - 1) - 6} y={y(last.value) - 8} textAnchor="end" fontSize={11} fill="#e4e4e7">
          {last.value}
        </text>
      </svg>
      <p className="mt-1 text-[11px] text-zinc-500">
        {delta === 0
          ? "sem variação no período"
          : `${delta > 0 ? "+" : ""}${delta} ${unit} desde a primeira medição`}
      </p>
    </div>
  );
}
