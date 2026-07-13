import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Um mostrador tipo relógio (arco semicircular) — consumido hoje vs. meta diária. */
function Gauge({
  label,
  value,
  max,
  unit,
  color,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const angle = pct * 180;
  const R = 46;
  const CX = 58;
  const CY = 58;
  const rad = (deg: number) => ((180 - deg) * Math.PI) / 180;

  const arc = (fromDeg: number, toDeg: number, col: string) => {
    const p1 = { x: CX + R * Math.cos(rad(fromDeg)), y: CY - R * Math.sin(rad(fromDeg)) };
    const p2 = { x: CX + R * Math.cos(rad(toDeg)), y: CY - R * Math.sin(rad(toDeg)) };
    const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
    return (
      <path
        d={`M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${R} ${R} 0 ${largeArc} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`}
        stroke={col}
        strokeWidth={10}
        strokeLinecap="round"
        fill="none"
      />
    );
  };

  const overBudget = value > max;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 116 70" className="w-28">
        {arc(0, 180, "#27272a")}
        {arc(0, angle, overBudget ? "#f87171" : color)}
      </svg>
      <p className="-mt-1 text-sm font-semibold" style={{ color: overBudget ? "#f87171" : color }}>
        {Math.round(value)}
        <span className="text-[10px] text-zinc-500"> /{max} {unit}</span>
      </p>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}

export function MacroGaugesCard({
  consumed,
  targets,
}: {
  consumed: { calories: number; carbs_g: number; protein_g: number; fat_g: number };
  targets: { calories: number; carbs_g: number; protein_g: number; fat_g: number };
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">🎯 Consumo de hoje</CardTitle>
        <CardDescription>Quanto falta até sua meta diária — estimativa educativa.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap justify-center gap-2">
          <Gauge label="Calorias" value={consumed.calories} max={targets.calories} unit="kcal" color="#e4e4e7" />
          <Gauge label="Carboidrato" value={consumed.carbs_g} max={targets.carbs_g} unit="g" color="#38bdf8" />
          <Gauge label="Proteína" value={consumed.protein_g} max={targets.protein_g} unit="g" color="#34d399" />
          <Gauge label="Gordura" value={consumed.fat_g} max={targets.fat_g} unit="g" color="#fbbf24" />
        </div>
      </CardContent>
    </Card>
  );
}
