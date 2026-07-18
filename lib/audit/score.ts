import type {
  AuditFactor,
  AuditLabel,
  AuditMetrics,
  AuditPlanItem,
  MetabolicAuditReport,
} from "@/lib/audit/types";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function pushFactor(
  factors: AuditFactor[],
  factor: Omit<AuditFactor, "scoreImpact"> & { scoreImpact: number }
): number {
  if (factor.scoreImpact <= 0) return 0;
  factors.push(factor);
  return factor.scoreImpact;
}

/**
 * Score educativo 0–100 (maior = melhor controle pessoal no período).
 * Não é diagnóstico clínico — usa limiares alinhados ao dashboard/TIR.
 */
export function scoreFromMetrics(
  metrics: AuditMetrics,
  periodStart: string,
  periodEnd: string
): MetabolicAuditReport {
  const factors: AuditFactor[] = [];
  let score = 100;

  const insufficient =
    metrics.readingCount < 7 || metrics.daysWithGlucose < 3;

  if (insufficient) {
    return {
      score: 0,
      label: "Dados insuficientes",
      metrics,
      factors: [
        {
          id: "insufficient_data",
          label: "Poucos dados no período",
          severity: "info",
          weight: 1,
          evidence: `${metrics.readingCount} leituras em ${metrics.daysWithGlucose} dias. Precisa de pelo menos 7 leituras em 3 dias.`,
          scoreImpact: 0,
        },
      ],
      plan: [
        {
          priority: 1,
          title: "Registrar glicemia com mais frequência",
          why: "Sem série mínima o mapa de risco não consegue estimar TIR nem padrões.",
          href: "/glicemia",
          actionLabel: "Registrar leitura",
        },
        {
          priority: 2,
          title: "Conectar sensor (CGM)",
          why: "Leituras densas melhoram a auditoria sem esforço manual.",
          href: "/glicemia/sensor",
          actionLabel: "Ver sensor",
        },
      ],
      periodStart,
      periodEnd,
      windowDays: metrics.windowDays,
    };
  }

  if (metrics.tirPercent != null) {
    if (metrics.tirPercent < 50) {
      score -= pushFactor(factors, {
        id: "tir_low",
        label: "Tempo na faixa baixo",
        severity: "critical",
        weight: 3,
        evidence: `TIR ${metrics.tirPercent}% (meta pessoal).`,
        scoreImpact: 28,
      });
    } else if (metrics.tirPercent < 70) {
      score -= pushFactor(factors, {
        id: "tir_moderate",
        label: "Tempo na faixa moderado",
        severity: "warning",
        weight: 2,
        evidence: `TIR ${metrics.tirPercent}% — abaixo de 70%.`,
        scoreImpact: 14,
      });
    }
  }

  if (metrics.hypoCount > 0) {
    const impact = clamp(metrics.hypoCount * 6, 6, 24);
    score -= pushFactor(factors, {
      id: "hypos",
      label: "Episódios de hipoglicemia",
      severity: metrics.hypoCount >= 3 ? "critical" : "warning",
      weight: 3,
      evidence: `${metrics.hypoCount} leitura(s) abaixo da meta mínima.`,
      scoreImpact: impact,
    });
  }

  if (metrics.hyperCount > 0) {
    const impact = clamp(Math.round(metrics.hyperCount * 2.5), 4, 22);
    score -= pushFactor(factors, {
      id: "hypers",
      label: "Leituras acima da meta",
      severity: metrics.hyperCount >= 8 ? "critical" : "warning",
      weight: 2,
      evidence: `${metrics.hyperCount} leitura(s) acima da meta máxima.`,
      scoreImpact: impact,
    });
  }

  if (metrics.stdDev != null && metrics.avgGlucose != null && metrics.avgGlucose > 0) {
    const cv = (metrics.stdDev / metrics.avgGlucose) * 100;
    if (cv >= 36) {
      score -= pushFactor(factors, {
        id: "variability_high",
        label: "Variabilidade alta",
        severity: "warning",
        weight: 2,
        evidence: `Desvio ~${metrics.stdDev} mg/dL (CV ~${Math.round(cv)}%).`,
        scoreImpact: 12,
      });
    }
  }

  if (metrics.spikeMealCount >= 3) {
    score -= pushFactor(factors, {
      id: "meal_spikes",
      label: "Picos pós-refeição",
      severity: "warning",
      weight: 1.5,
      evidence: `${metrics.spikeMealCount} refeições marcadas com spike.`,
      scoreImpact: clamp(metrics.spikeMealCount * 2, 6, 14),
    });
  }

  if (metrics.activeDays === 0 && metrics.windowDays >= 7) {
    score -= pushFactor(factors, {
      id: "sedentary",
      label: "Pouca atividade registrada",
      severity: "info",
      weight: 1,
      evidence: `Nenhum dia com ≥15 min de exercício nos últimos ${metrics.windowDays} dias.`,
      scoreImpact: 8,
    });
  }

  if (metrics.lowSleepDays >= 3) {
    score -= pushFactor(factors, {
      id: "sleep_debt",
      label: "Noites com pouco sono",
      severity: "info",
      weight: 1,
      evidence: `${metrics.lowSleepDays} dias com sono < 6 h.`,
      scoreImpact: 6,
    });
  }

  if (metrics.waterDays < Math.max(2, Math.floor(metrics.windowDays / 4))) {
    score -= pushFactor(factors, {
      id: "hydration",
      label: "Hidratação pouco registrada",
      severity: "info",
      weight: 0.5,
      evidence: `Só ${metrics.waterDays} dia(s) com ≥500 ml registrados.`,
      scoreImpact: 4,
    });
  }

  if (metrics.examAlteredCount > 0) {
    score -= pushFactor(factors, {
      id: "exam_altered",
      label: "Valores alterados em exames",
      severity: "warning",
      weight: 1,
      evidence: `${metrics.examAlteredCount} parâmetro(s) classificado(s) como alterado(s) nos laudos recentes.`,
      scoreImpact: clamp(metrics.examAlteredCount * 3, 3, 12),
    });
  }

  score = Math.round(clamp(score, 0, 100));

  const label: AuditLabel =
    score < 45 ? "Alerta" : score < 70 ? "Atenção" : "Estável";

  // `weight` era gravado em cada fator mas nunca influenciava nada — nem o
  // score (scoreImpact já é calculado à parte) nem a ordem de exibição (que
  // usava só scoreImpact). Usa weight como critério principal de ordenação,
  // com scoreImpact como desempate: assim um fator clinicamente mais grave
  // (ex.: 1 hipoglicemia, weight 3) aparece antes de um fator informativo
  // com o mesmo impacto pontual (ex.: hidratação, weight 0.5).
  factors.sort((a, b) => b.weight - a.weight || b.scoreImpact - a.scoreImpact);

  return {
    score,
    label,
    metrics,
    factors,
    plan: buildPlan(factors, metrics),
    periodStart,
    periodEnd,
    windowDays: metrics.windowDays,
  };
}

function buildPlan(factors: AuditFactor[], metrics: AuditMetrics): AuditPlanItem[] {
  const plan: AuditPlanItem[] = [];
  const ids = new Set(factors.map((f) => f.id));

  const add = (item: AuditPlanItem) => {
    if (plan.some((p) => p.href === item.href && p.title === item.title)) return;
    plan.push(item);
  };

  if (ids.has("hypos")) {
    add({
      priority: 1,
      title: "Revisar padrões de hipoglicemia",
      why: "Hipos pedem atenção imediata — anote horários e leve ao médico.",
      href: "/glicemia/historico",
      actionLabel: "Ver histórico",
    });
  }
  if (ids.has("tir_low") || ids.has("tir_moderate") || ids.has("hypers")) {
    add({
      priority: plan.length + 1,
      title: "Acompanhar tendência na faixa",
      why: `TIR atual ${metrics.tirPercent ?? "—"}%. Ajuste hábitos e conversa com a equipe clínica.`,
      href: "/glicemia/tendencias",
      actionLabel: "Ver tendências",
    });
  }
  if (ids.has("variability_high")) {
    add({
      priority: plan.length + 1,
      title: "Reduzir variabilidade da glicemia",
      why: "Oscilação alta entre leituras pesa tanto quanto ficar fora da faixa — regularidade em refeições e doses ajuda.",
      href: "/glicemia/tendencias",
      actionLabel: "Ver tendências",
    });
  }
  if (ids.has("meal_spikes")) {
    add({
      priority: plan.length + 1,
      title: "Registrar refeições e picos",
      why: "Associar prato ↔ glicemia ajuda a reduzir spikes.",
      href: "/alimentacao/foto",
      actionLabel: "Foto da refeição",
    });
  }
  if (ids.has("sedentary")) {
    add({
      priority: plan.length + 1,
      title: "Incluir caminhada curta",
      why: "15–20 min após refeições costuma ajudar o controle pessoal.",
      href: "/exercicios/plano",
      actionLabel: "Ver plano",
    });
  }
  if (ids.has("sleep_debt")) {
    add({
      priority: plan.length + 1,
      title: "Registrar sono / saúde",
      why: "Noites curtas correlacionam com médias mais altas nos insights.",
      href: "/integracoes",
      actionLabel: "Integrações",
    });
  }
  if (ids.has("hydration")) {
    add({
      priority: plan.length + 1,
      title: "Registrar água no dia",
      why: "Hidratação entra no mapa e no dashboard diário.",
      href: "/dashboard",
      actionLabel: "Ir ao Hoje",
    });
  }
  if (ids.has("exam_altered")) {
    add({
      priority: plan.length + 1,
      title: "Revisar exames com o médico",
      why: "Valores fora da faixa são assuntos de consulta — não conduta do app.",
      href: "/exames",
      actionLabel: "Ver exames",
    });
  }

  if (plan.length === 0) {
    add({
      priority: 1,
      title: "Manter o ritmo de registros",
      why: "Controle estável no período — continue glicemia, refeições e atividade.",
      href: "/insights",
      actionLabel: "Ver insights",
    });
  }

  return plan.slice(0, 6).map((p, i) => ({ ...p, priority: i + 1 }));
}
