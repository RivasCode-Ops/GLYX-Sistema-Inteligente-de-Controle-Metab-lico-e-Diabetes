"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeBolusDose } from "@/lib/medications/bolus-calculator";

type Props = {
  carbRatio: number | null;
  correctionFactor: number | null;
  targetGlucose: number | null;
  latestGlucose: number | null;
};

export function BolusCalculatorForm({
  carbRatio,
  correctionFactor,
  targetGlucose,
  latestGlucose,
}: Props) {
  const [carbsG, setCarbsG] = useState("");
  const [currentGlucose, setCurrentGlucose] = useState(
    latestGlucose != null ? String(latestGlucose) : ""
  );

  const result = useMemo(() => {
    const carbs = Number.parseFloat(carbsG);
    if (!Number.isFinite(carbs) || carbs < 0) return null;
    const glucose = currentGlucose ? Number.parseFloat(currentGlucose) : null;
    return computeBolusDose({
      carbsG: carbs,
      currentGlucose: Number.isFinite(glucose) ? glucose : null,
      carbRatio,
      correctionFactor,
      targetGlucose,
    });
  }, [carbsG, currentGlucose, carbRatio, correctionFactor, targetGlucose]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="bolus_carbs">Carboidrato da refeição (g)</Label>
          <Input
            id="bolus_carbs"
            type="number"
            min={0}
            value={carbsG}
            onChange={(e) => setCarbsG(e.target.value)}
            placeholder="ex.: 60"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="bolus_glucose">Glicemia atual (mg/dL)</Label>
          <Input
            id="bolus_glucose"
            type="number"
            min={0}
            value={currentGlucose}
            onChange={(e) => setCurrentGlucose(e.target.value)}
            placeholder="ex.: 150"
          />
        </div>
      </div>

      {result ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/30 p-4">
          <p className="text-[11px] uppercase tracking-wide text-emerald-400/80">Dose sugerida</p>
          <p className="mt-1 font-mono text-3xl text-zinc-50">{result.totalDose}U</p>
          <div className="mt-2 flex gap-4 text-xs text-zinc-400">
            <span>Carboidrato: {result.carbDose}U</span>
            <span>Correção: {result.correctionDose}U</span>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-500">
          Informe o carboidrato da refeição pra calcular.
        </p>
      )}

      <p className="text-[11px] leading-4 text-zinc-600">
        Cálculo educativo com base nos parâmetros que você definiu em Perfil — não é prescrição
        médica. Confirme sempre com seu endocrinologista antes de aplicar qualquer dose.
      </p>
    </div>
  );
}
