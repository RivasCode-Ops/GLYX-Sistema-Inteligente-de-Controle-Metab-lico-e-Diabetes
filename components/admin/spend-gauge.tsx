import { formatUsd } from "@/lib/ai/cost";

/** Gauge tipo "relógio" (arco semicircular) mostrando gasto vs meta diária. */
export function SpendGauge({
  label,
  costUsd,
  budgetUsd,
  calls,
}: {
  label: string;
  costUsd: number;
  budgetUsd: number;
  calls: number;
}) {
  const pct = Math.max(0, Math.min(1, budgetUsd > 0 ? costUsd / budgetUsd : 0));
  const angle = pct * 180;
  const R = 70;
  const CX = 90;
  const CY = 90;
  const rad = (deg: number) => ((180 - deg) * Math.PI) / 180;
  const needleX = CX + R * 0.82 * Math.cos(rad(angle));
  const needleY = CY - R * 0.82 * Math.sin(rad(angle));

  const color = pct >= 0.9 ? "#f87171" : pct >= 0.6 ? "#fbbf24" : "#34d399";

  const arc = (fromDeg: number, toDeg: number, col: string) => {
    const p1 = { x: CX + R * Math.cos(rad(fromDeg)), y: CY - R * Math.sin(rad(fromDeg)) };
    const p2 = { x: CX + R * Math.cos(rad(toDeg)), y: CY - R * Math.sin(rad(toDeg)) };
    const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
    return (
      <path
        d={`M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${R} ${R} 0 ${largeArc} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`}
        stroke={col}
        strokeWidth={14}
        strokeLinecap="round"
        fill="none"
      />
    );
  };

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 110" className="w-44">
        {arc(0, 180, "#27272a")}
        {arc(0, angle, color)}
        <line
          x1={CX}
          y1={CY}
          x2={needleX}
          y2={needleY}
          stroke="#e4e4e7"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r={4} fill="#e4e4e7" />
      </svg>
      <p className="-mt-2 text-lg font-semibold" style={{ color }}>
        {formatUsd(costUsd)}
      </p>
      <p className="text-[11px] text-zinc-500">
        {label} · meta {formatUsd(budgetUsd)} · {calls} chamadas
      </p>
    </div>
  );
}
