/**
 * Limiares glicêmicos compartilhados — fonte única.
 *
 * Existiam como literal repetido em cada arquivo que precisava deles, o que já
 * produziu divergência real: o alerta usava a meta do perfil, o preditor do CGM
 * usava 70 fixo, e três lugares diferentes chamavam "hiperglicemia" coisas
 * distintas (>= 250 no alerta e no relatório, > meta máxima no TIR). Módulo sem
 * dependência de servidor de propósito: a calculadora de bolus roda no cliente
 * e não pode arrastar Supabase/push junto.
 *
 * Vocabulário, porque a confusão anterior era de nome antes de ser de número:
 *
 * - **acima da meta** (`> targetMax`): faixa individual combinada com o médico,
 *   base do TIR. Não é evento clínico — é o contador que diz quanto tempo o
 *   usuário passou fora do alvo dele.
 * - **hiperglicemia severa** (`>= SEVERE_HYPER_MG_DL`): evento que dispara
 *   alerta e vira linha no relatório médico. Independe da meta pessoal.
 * - **hipoglicemia** (`< hypoThreshold`): meta mínima do perfil, ou 70.
 *
 * Os valores são padrões iniciais — a faixa real vive em
 * `profiles.target_glucose_min/max`.
 */

/** Abaixo disto é hipoglicemia quando o perfil não define meta mínima própria. */
export const DEFAULT_HYPO_MG_DL = 70;

/** Faixa-alvo padrão, usada quando o perfil ainda não foi configurado. */
export const DEFAULT_TARGET_MIN_MG_DL = 70;
export const DEFAULT_TARGET_MAX_MG_DL = 180;

/**
 * Hiperglicemia severa. Fixo de propósito: é o ponto em que o app alerta e em
 * que o relatório marca o dia como extremo, independentemente de o usuário ter
 * combinado uma meta máxima mais alta ou mais baixa com o médico.
 */
export const SEVERE_HYPER_MG_DL = 250;

/** Limites de sanidade da faixa-alvo configurável no perfil. */
export const TARGET_MIN_FLOOR_MG_DL = 60;
export const TARGET_MIN_CEIL_MG_DL = 130;
export const TARGET_MAX_FLOOR_MG_DL = 100;
export const TARGET_MAX_CEIL_MG_DL = 300;
/** Distância mínima entre mínima e máxima — faixa colada não produz TIR útil. */
export const MIN_TARGET_SPAN_MG_DL = 20;

export type GlucoseTargets = {
  /** Meta mínima (limite inferior do TIR) e limiar de hipoglicemia. */
  targetMin: number;
  /** Meta máxima (limite superior do TIR). */
  targetMax: number;
  /** Igual a `targetMin`; nome separado para deixar o uso clínico explícito. */
  hypoThreshold: number;
  /** Limiar de hiperglicemia severa (não depende do perfil). */
  severeHyper: number;
};

/** Limiar de hipoglicemia do usuário: meta mínima do perfil, ou o padrão. */
export function hypoThresholdFor(targetGlucoseMin: number | null | undefined): number {
  return targetGlucoseMin ?? DEFAULT_HYPO_MG_DL;
}

/**
 * Faixa-alvo é coerente? Usado tanto na validação do formulário de perfil
 * quanto na leitura, porque linhas gravadas antes desta validação existir podem
 * ter min > max.
 */
export function isCoherentTargetRange(
  min: number | null | undefined,
  max: number | null | undefined
): boolean {
  if (min == null || max == null) return false;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
  if (min < TARGET_MIN_FLOOR_MG_DL || min > TARGET_MIN_CEIL_MG_DL) return false;
  if (max < TARGET_MAX_FLOOR_MG_DL || max > TARGET_MAX_CEIL_MG_DL) return false;
  return max - min >= MIN_TARGET_SPAN_MG_DL;
}

/**
 * Resolve a faixa-alvo efetiva a partir da linha de `profiles`.
 *
 * Faixa incoerente cai INTEIRA para o padrão, não meio a meio: aproveitar só o
 * valor "válido" de um par incoerente inventa uma faixa que nem o usuário nem o
 * médico definiram, e ela ia direto para TIR, risco e alerta.
 */
export function resolveGlucoseTargets(
  profile:
    | { target_glucose_min?: number | null; target_glucose_max?: number | null }
    | null
    | undefined
): GlucoseTargets {
  const min = profile?.target_glucose_min ?? null;
  const max = profile?.target_glucose_max ?? null;
  const coherent = isCoherentTargetRange(min, max);
  const targetMin = coherent ? (min as number) : DEFAULT_TARGET_MIN_MG_DL;
  const targetMax = coherent ? (max as number) : DEFAULT_TARGET_MAX_MG_DL;
  return {
    targetMin,
    targetMax,
    hypoThreshold: targetMin,
    severeHyper: SEVERE_HYPER_MG_DL,
  };
}
