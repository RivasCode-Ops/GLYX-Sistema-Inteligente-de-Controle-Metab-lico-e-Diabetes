/**
 * Predição de tendência glicêmica a partir das leituras do sensor
 * (regressão linear simples sobre a janela recente). Mesmo princípio dos
 * alertas preditivos de CGM: agir ANTES da hipoglicemia acontecer.
 * Estimativa educativa — não substitui o alarme do próprio sensor.
 */

import { DEFAULT_HYPO_MG_DL } from "@/lib/health/glucose-thresholds";

export type TrendPoint = { valueMgDl: number; recordedAt: string };

export type TrendPrediction = {
  /** mg/dL por minuto (negativo = caindo) */
  slopePerMin: number;
  /** valor projetado no horizonte */
  projectedMgDl: number;
  /** última leitura usada */
  currentMgDl: number;
  horizonMin: number;
};

const WINDOW_MS = 25 * 60 * 1000;
const MIN_POINTS = 3;

export function predictTrend(points: TrendPoint[], horizonMin = 30): TrendPrediction | null {
  if (points.length < MIN_POINTS) return null;

  const sorted = [...points].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const lastTs = new Date(sorted[sorted.length - 1].recordedAt).getTime();
  const recent = sorted.filter((p) => lastTs - new Date(p.recordedAt).getTime() <= WINDOW_MS);
  if (recent.length < MIN_POINTS) return null;

  // Regressão linear (x em minutos relativos, y em mg/dL)
  const xs = recent.map((p) => (new Date(p.recordedAt).getTime() - lastTs) / 60_000);
  const ys = recent.map((p) => p.valueMgDl);
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;

  const slope = num / den;
  const current = ys[ys.length - 1];
  return {
    slopePerMin: Math.round(slope * 100) / 100,
    projectedMgDl: Math.round(current + slope * horizonMin),
    currentMgDl: current,
    horizonMin,
  };
}

/**
 * Alerta preditivo: ainda acima do limiar de hipo, mas caindo rumo a ele no
 * horizonte.
 *
 * O limiar vem do perfil (`target_glucose_min`) — antes era 70 fixo aqui,
 * enquanto o alerta por leitura (lib/insights/rules.ts) já respeitava a meta
 * pessoal. Para um usuário com meta mínima 80, o alerta reativo disparava em 79
 * e o preditivo só considerava queda rumo a 70: dois caminhos de hipo com
 * limiares diferentes para a mesma pessoa.
 */
export function isPredictedHypo(
  t: TrendPrediction | null,
  hypoThreshold: number = DEFAULT_HYPO_MG_DL
): boolean {
  return (
    t !== null &&
    t.currentMgDl >= hypoThreshold &&
    t.projectedMgDl < hypoThreshold &&
    t.slopePerMin <= -0.5
  );
}
