/**
 * Limiares glicêmicos compartilhados.
 *
 * Existiam como literal repetido em cada arquivo que precisava deles, o que já
 * produziu divergência real (o alerta usa a meta do perfil, o preditor do CGM
 * usava 70 fixo). Módulo sem dependência de servidor de propósito: a
 * calculadora de bolus roda no cliente e não pode arrastar Supabase/push junto.
 *
 * Os valores são padrões iniciais — a faixa real é definida com o médico e vive
 * em `profiles.target_glucose_min/max`.
 */

/** Abaixo disto é hipoglicemia quando o perfil não define meta mínima própria. */
export const DEFAULT_HYPO_MG_DL = 70;

/** Faixa-alvo padrão, usada quando o perfil ainda não foi configurado. */
export const DEFAULT_TARGET_MIN_MG_DL = 70;
export const DEFAULT_TARGET_MAX_MG_DL = 180;

/** Limiar de hipoglicemia do usuário: meta mínima do perfil, ou o padrão. */
export function hypoThresholdFor(targetGlucoseMin: number | null | undefined): number {
  return targetGlucoseMin ?? DEFAULT_HYPO_MG_DL;
}
