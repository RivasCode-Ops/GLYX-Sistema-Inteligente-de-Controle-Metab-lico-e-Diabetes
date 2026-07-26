/**
 * Composição corporal estimada a partir de medidas de fita e dobras cutâneas.
 *
 * Tudo aqui é **estimativa educativa**, não medida: nenhuma fórmula de fita ou
 * dobra mede gordura — todas inferem a partir de uma equação de regressão feita
 * numa população específica, com erro padrão de ~3-4 pontos percentuais. O uso
 * correto é acompanhar a TENDÊNCIA da mesma pessoa medida do mesmo jeito, não
 * comparar o número absoluto com o de outra pessoa ou com um exame (DEXA/bioimpedância).
 *
 * Isso não é ressalva de rodapé, é regra de código: o valor absoluto só aparece
 * junto do método usado, e a comparação entre duas datas exige o MESMO método
 * (ver `sameMethod`) — trocar de fita para dobra no meio produz um "salto" de
 * gordura que não aconteceu no corpo.
 *
 * Fontes das equações:
 * - Circunferências: US Navy / Hodgdon & Beckett (1984)
 * - Dobras: Jackson & Pollock 3 dobras (1978/1980) + Siri (1961) para densidade→%
 * - FFMI normalizado: Kouri et al. (1995)
 */

import {
  bilateralAverage,
  measurementValue,
  type BodyMeasurement,
} from "@/lib/body/fields";

export type Sex = "m" | "f";

/** Método usado para estimar a gordura — comparações só valem dentro do mesmo. */
export type BodyFatMethod = "dobras" | "circunferencias";

export const METHOD_LABEL: Record<BodyFatMethod, string> = {
  dobras: "dobras cutâneas (Jackson-Pollock 3)",
  circunferencias: "circunferências (US Navy)",
};

export type BodyComposition = {
  bmi: number | null;
  /** Relação cintura/altura — melhor preditor de risco cardiometabólico que o IMC. */
  waistToHeight: number | null;
  bodyFatPercent: number | null;
  bodyFatMethod: BodyFatMethod | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  /** Índice de massa livre de gordura, normalizado para 1,80 m. */
  ffmi: number | null;
  weightKg: number | null;
};

export type CompositionInput = {
  measurement: BodyMeasurement;
  sex: Sex | null;
  ageYears: number | null;
  heightCm: number | null;
  /** Peso de `weight_logs` quando a medição não trouxe peso próprio. */
  fallbackWeightKg?: number | null;
};

/** Faixa fisiologicamente possível; fora disso a conta errou (medida trocada, unidade errada). */
const MIN_BF = 3;
const MAX_BF = 70;

function plausibleBodyFat(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < MIN_BF || value > MAX_BF) return null;
  return Math.round(value * 10) / 10;
}

export function bmi(weightKg: number, heightCm: number): number | null {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  const value = weightKg / (m * m);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

/**
 * Gordura por circunferências (US Navy). Homem usa cintura e pescoço; mulher
 * usa cintura, quadril e pescoço — sem quadril, a equação feminina não existe e
 * a função devolve null em vez de aplicar a masculina.
 */
export function bodyFatFromCircumferences(input: {
  sex: Sex;
  heightCm: number;
  waistCm: number;
  neckCm: number;
  hipCm?: number | null;
}): number | null {
  const { sex, heightCm, waistCm, neckCm, hipCm } = input;
  if (!(heightCm > 0) || !(waistCm > 0) || !(neckCm > 0)) return null;

  if (sex === "m") {
    const diff = waistCm - neckCm;
    if (diff <= 0) return null;
    const value =
      495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm)) - 450;
    return plausibleBodyFat(value);
  }

  if (!(hipCm && hipCm > 0)) return null;
  const sum = waistCm + hipCm - neckCm;
  if (sum <= 0) return null;
  const value =
    495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.221 * Math.log10(heightCm)) - 450;
  return plausibleBodyFat(value);
}

/**
 * Gordura por 3 dobras (Jackson-Pollock) + Siri.
 *
 * Os pontos são diferentes por sexo — homem: peitoral, abdominal e coxa;
 * mulher: tricipital, supra-ilíaca e coxa. Faltando uma das três do protocolo
 * do sexo, devolve null: completar com outra dobra muda a equação e o número
 * deixa de significar o que diz significar.
 */
export function bodyFatFromSkinfolds(input: {
  sex: Sex;
  ageYears: number;
  chestMm?: number | null;
  abdominalMm?: number | null;
  thighMm?: number | null;
  tricepsMm?: number | null;
  suprailiacMm?: number | null;
}): number | null {
  const { sex, ageYears } = input;
  if (!(ageYears > 0)) return null;

  let sum: number;
  let density: number;

  if (sex === "m") {
    const { chestMm, abdominalMm, thighMm } = input;
    if (!chestMm || !abdominalMm || !thighMm) return null;
    sum = chestMm + abdominalMm + thighMm;
    density = 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * ageYears;
  } else {
    const { tricepsMm, suprailiacMm, thighMm } = input;
    if (!tricepsMm || !suprailiacMm || !thighMm) return null;
    sum = tricepsMm + suprailiacMm + thighMm;
    density = 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * ageYears;
  }

  if (!(density > 0)) return null;
  return plausibleBodyFat(495 / density - 450);
}

/**
 * FFMI normalizado para 1,80 m (Kouri) — massa magra corrigida pela altura.
 * Serve para acompanhar ganho muscular sem depender do peso total, que mistura
 * músculo, gordura e água.
 */
export function normalizedFfmi(leanMassKg: number, heightCm: number): number | null {
  if (!(leanMassKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  const raw = leanMassKg / (m * m);
  const value = raw + 6.1 * (1.8 - m);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

/**
 * Consolida uma medição em composição estimada.
 *
 * Preferência por dobras quando o protocolo completo existe: erro menor que
 * circunferências para acompanhar mudança. Sem dobras, cai para fita. Sem
 * nenhum dos dois (ou sem sexo/altura no perfil), devolve o que dá — IMC e
 * cintura/altura ainda funcionam sozinhos.
 */
export function computeComposition(input: CompositionInput): BodyComposition {
  const { measurement, sex, ageYears, heightCm } = input;
  const weightKg = measurementValue(measurement, "weight_kg") ?? input.fallbackWeightKg ?? null;
  const waistCm = measurementValue(measurement, "waist_cm");

  const out: BodyComposition = {
    bmi: weightKg != null && heightCm != null ? bmi(weightKg, heightCm) : null,
    waistToHeight:
      waistCm != null && heightCm != null && heightCm > 0
        ? Math.round((waistCm / heightCm) * 100) / 100
        : null,
    bodyFatPercent: null,
    bodyFatMethod: null,
    fatMassKg: null,
    leanMassKg: null,
    ffmi: null,
    weightKg,
  };

  if (!sex || !heightCm) return out;

  const fromSkinfolds =
    ageYears != null
      ? bodyFatFromSkinfolds({
          sex,
          ageYears,
          chestMm: measurementValue(measurement, "skf_chest_mm"),
          abdominalMm: measurementValue(measurement, "skf_abdominal_mm"),
          thighMm: measurementValue(measurement, "skf_thigh_mm"),
          tricepsMm: measurementValue(measurement, "skf_triceps_mm"),
          suprailiacMm: measurementValue(measurement, "skf_suprailiac_mm"),
        })
      : null;

  const fromCircumferences =
    waistCm != null
      ? bodyFatFromCircumferences({
          sex,
          heightCm,
          waistCm,
          neckCm: measurementValue(measurement, "neck_cm") ?? 0,
          hipCm: measurementValue(measurement, "hip_cm"),
        })
      : null;

  const bodyFatPercent = fromSkinfolds ?? fromCircumferences;
  if (bodyFatPercent == null) return out;

  out.bodyFatPercent = bodyFatPercent;
  out.bodyFatMethod = fromSkinfolds != null ? "dobras" : "circunferencias";

  if (weightKg != null) {
    out.fatMassKg = Math.round(weightKg * (bodyFatPercent / 100) * 10) / 10;
    out.leanMassKg = Math.round((weightKg - out.fatMassKg) * 10) / 10;
    out.ffmi = normalizedFfmi(out.leanMassKg, heightCm);
  }

  return out;
}

/** Duas composições são comparáveis? Método diferente = salto artificial. */
export function sameMethod(a: BodyComposition, b: BodyComposition): boolean {
  return a.bodyFatMethod != null && a.bodyFatMethod === b.bodyFatMethod;
}

export type RiskBand = { label: string; tone: "ok" | "atencao" | "alto" };

/**
 * Faixa de risco pela relação cintura/altura (limiares da NICE/consenso: manter
 * a cintura abaixo de metade da altura). Educativo — não é diagnóstico.
 */
export function waistToHeightBand(ratio: number | null): RiskBand | null {
  if (ratio == null) return null;
  if (ratio < 0.5) return { label: "Dentro da faixa saudável", tone: "ok" };
  if (ratio < 0.6) return { label: "Risco cardiometabólico aumentado", tone: "atencao" };
  return { label: "Risco cardiometabólico alto", tone: "alto" };
}

/** Índice de simetria entre lados (0-100). Assimetria persistente > 5% merece atenção técnica. */
export function bilateralAsymmetryPercent(
  m: BodyMeasurement,
  right: Parameters<typeof measurementValue>[1],
  left: Parameters<typeof measurementValue>[1]
): number | null {
  const r = measurementValue(m, right);
  const l = measurementValue(m, left);
  if (r == null || l == null || r <= 0 || l <= 0) return null;
  const diff = Math.abs(r - l);
  return Math.round((diff / Math.max(r, l)) * 1000) / 10;
}

export { bilateralAverage };
