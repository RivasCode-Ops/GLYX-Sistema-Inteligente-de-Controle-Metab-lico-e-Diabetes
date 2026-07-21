"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/status-pill";
import { computeBolusDose, type BolusWarning } from "@/lib/medications/bolus-calculator";

const WARNING_TEXT: Record<BolusWarning, string> = {
  abaixo_da_meta:
    "Glicemia abaixo da meta de bolus — a dose não inclui correção. Considere confirmar com seu médico antes de aplicar.",
  sem_iob:
    "Este cálculo não desconta insulina de aplicações anteriores que ainda esteja agindo. Se você aplicou há pouco, o total pode estar alto.",
};

type Props = {
  carbRatio: number | null;
  correctionFactor: number | null;
  targetGlucose: number | null;
  latestGlucose: number | null;
  /** Meta mínima do perfil — define o limiar de hipo que trava o cálculo. */
  targetGlucoseMin: number | null;
};

export function BolusCalculatorForm({
  carbRatio,
  correctionFactor,
  targetGlucose,
  latestGlucose,
  targetGlucoseMin,
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
      currentGlucose: glucose != null && Number.isFinite(glucose) ? glucose : null,
      carbRatio,
      correctionFactor,
      targetGlucose,
      targetGlucoseMin,
    });
  }, [carbsG, currentGlucose, carbRatio, correctionFactor, targetGlucose, targetGlucoseMin]);

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

      {result?.status === "blocked" ? (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4">
          <StatusPill tone="red" className="mb-2">
            Glicemia baixa
          </StatusPill>
          <p className="font-mono text-3xl text-red-200">{result.glucose} mg/dL</p>
          <p className="mt-2 text-sm text-zinc-200">
            Abaixo do seu limiar de {result.threshold} mg/dL — o cálculo de dose fica bloqueado.
            Corrija a hipoglicemia com carboidrato rápido e meça de novo em 15 min.
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Aplicar insulina agora pode aprofundar a queda. Se a refeição for inevitável, fale com
            seu médico sobre como proceder.
          </p>
        </div>
      ) : result?.status === "ok" ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/30 p-4">
            <p className="text-[11px] uppercase tracking-wide text-emerald-400/80">Dose sugerida</p>
            <p className="mt-1 font-mono text-3xl text-zinc-50">{result.totalDose}U</p>
            <div className="mt-2 flex gap-4 text-xs text-zinc-400">
              <span>Carboidrato: {result.carbDose}U</span>
              <span>Correção: {result.correctionDose}U</span>
            </div>
          </div>
          {result.warnings.map((w) => (
            <div
              key={w}
              className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-zinc-300"
            >
              {WARNING_TEXT[w]}
            </div>
          ))}
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
