export type BolusInputs = {
  carbsG: number;
  currentGlucose: number | null;
  carbRatio: number | null;
  correctionFactor: number | null;
  targetGlucose: number | null;
};

export type BolusResult = {
  carbDose: number;
  correctionDose: number;
  totalDose: number;
};

/**
 * Dose sugerida = carboidrato/razão + correção (se a glicemia atual estiver
 * acima da meta). Retorna null se a razão carbo/insulina não estiver
 * configurada no perfil — sem ela não há cálculo possível.
 */
export function computeBolusDose(input: BolusInputs): BolusResult | null {
  if (!input.carbRatio || input.carbRatio <= 0) return null;

  const carbDose = input.carbsG / input.carbRatio;

  let correctionDose = 0;
  if (
    input.currentGlucose != null &&
    input.correctionFactor != null &&
    input.correctionFactor > 0 &&
    input.targetGlucose != null &&
    input.currentGlucose > input.targetGlucose
  ) {
    correctionDose = (input.currentGlucose - input.targetGlucose) / input.correctionFactor;
  }

  return {
    carbDose: Math.round(carbDose * 10) / 10,
    correctionDose: Math.round(correctionDose * 10) / 10,
    totalDose: Math.round((carbDose + correctionDose) * 10) / 10,
  };
}
