import { hypoThresholdFor } from "@/lib/health/glucose-thresholds";

export type BolusInputs = {
  carbsG: number;
  currentGlucose: number | null;
  carbRatio: number | null;
  correctionFactor: number | null;
  targetGlucose: number | null;
  /** Meta mínima do perfil (`target_glucose_min`); 70 quando não configurada. */
  targetGlucoseMin?: number | null;
};

export type BolusWarning =
  /** Glicemia abaixo da meta de bolus, mas ainda acima do limiar de hipo. */
  | "abaixo_da_meta"
  /** O cálculo não desconta insulina ainda ativa de uma aplicação anterior. */
  | "sem_iob";

export type BolusOutcome =
  /** Sem razão carbo/insulina no perfil — não há cálculo possível. */
  | { status: "unconfigured" }
  /** Glicemia em hipoglicemia: o cálculo é recusado de propósito. */
  | { status: "blocked"; reason: "hipoglicemia"; glucose: number; threshold: number }
  | {
      status: "ok";
      carbDose: number;
      correctionDose: number;
      totalDose: number;
      warnings: BolusWarning[];
    };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Dose sugerida = carboidrato/razão + correção (só se a glicemia estiver acima
 * da meta de bolus).
 *
 * Em hipoglicemia o cálculo é **recusado**, não reduzido: qualquer fator de
 * redução de dose seria conduta clínica inventada aqui: a orientação padrão é
 * tratar a hipo primeiro e remedir, que é o que o app já diz no alerta de
 * glicemia baixa. Antes desta trava, 55 mg/dL com 60 g de carboidrato devolvia
 * a dose cheia sem nenhum aviso — a correção virava zero e a parcela de
 * carboidrato passava intacta.
 *
 * O aviso `sem_iob` é permanente e não tem como ser resolvido pelo cálculo: o
 * app não registra insulina ativa, então empilhar doses é um risco real que o
 * usuário precisa enxergar em vez de deduzir.
 */
export function computeBolusDose(input: BolusInputs): BolusOutcome {
  if (!input.carbRatio || input.carbRatio <= 0) return { status: "unconfigured" };

  const threshold = hypoThresholdFor(input.targetGlucoseMin);
  if (input.currentGlucose != null && input.currentGlucose < threshold) {
    return {
      status: "blocked",
      reason: "hipoglicemia",
      glucose: input.currentGlucose,
      threshold,
    };
  }

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

  const warnings: BolusWarning[] = ["sem_iob"];
  if (
    input.currentGlucose != null &&
    input.targetGlucose != null &&
    input.currentGlucose < input.targetGlucose
  ) {
    warnings.unshift("abaixo_da_meta");
  }

  return {
    status: "ok",
    carbDose: round1(carbDose),
    correctionDose: round1(correctionDose),
    totalDose: round1(carbDose + correctionDose),
    warnings,
  };
}
