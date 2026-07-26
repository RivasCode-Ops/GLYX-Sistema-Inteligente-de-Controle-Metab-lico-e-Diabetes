/**
 * Resumo semanal educativo — a semana do usuário comparada com a anterior.
 *
 * **Não é AGP clínico** e não tenta ser: AGP exige densidade de CGM, percentis
 * por hora e leitura treinada. Aqui a pergunta é outra e mais simples: "a minha
 * semana foi melhor ou pior que a passada, e no quê?".
 *
 * Três regras que valem para tudo neste arquivo:
 *
 * 1. **Sem dado mínimo, sem comparação.** Abaixo do piso de
 *    `hasEnoughGlucoseData` o número existe mas descreve uma tarde, não uma
 *    semana. A tela diz o que falta em vez de mostrar uma TIR falsa.
 * 2. **TIR varia em pontos percentuais, não em "%".** "Subiu 8%" e "subiu 8
 *    pontos" são coisas diferentes, e a confusão entre as duas é clássica.
 * 3. **Nenhum destaque prescreve.** Descrevem o que mudou e por que importa;
 *    conduta é do médico. Hipoglicemia sempre aparece, mesmo isolada.
 */

import { hasEnoughGlucoseData, MIN_DAYS_FOR_ANALYSIS, MIN_READINGS_FOR_ANALYSIS } from "@/lib/audit/metrics";
import type { AuditMetrics } from "@/lib/audit/types";

export type WeeklyDelta = {
  current: number | null;
  previous: number | null;
  /** `current - previous`, ou null quando falta uma das pontas. */
  delta: number | null;
  /** `true` quando um número MENOR é o resultado desejado (hipos, hipers). */
  lowerIsBetter: boolean;
};

export type HighlightTone = "bom" | "atencao" | "info";

export type WeeklyHighlight = {
  id: string;
  text: string;
  tone: HighlightTone;
};

export type WeeklySummary = {
  periodStart: string;
  periodEnd: string;
  targetMin: number;
  targetMax: number;
  metrics: AuditMetrics;
  previousMetrics: AuditMetrics | null;
  /** Semana atual tem dado suficiente para qualquer leitura agregada. */
  hasData: boolean;
  /** As DUAS semanas têm dado suficiente — só então a comparação é honesta. */
  comparable: boolean;
  tirPercent: WeeklyDelta;
  avgGlucose: WeeklyDelta;
  hypoCount: WeeklyDelta;
  hyperCount: WeeklyDelta;
  severeHyperCount: WeeklyDelta;
  activeDays: WeeklyDelta;
  avgCarbsPerDay: WeeklyDelta;
  waterDays: WeeklyDelta;
  highlights: WeeklyHighlight[];
};

/** Variação de TIR abaixo disso é oscilação normal de semana, não tendência. */
export const TIR_MEANINGFUL_POINTS = 3;
/** Coeficiente de variação a partir do qual a glicemia é considerada instável. */
export const HIGH_CV_PERCENT = 36;

function delta(
  current: number | null | undefined,
  previous: number | null | undefined,
  lowerIsBetter = false
): WeeklyDelta {
  const c = current ?? null;
  const p = previous ?? null;
  return {
    current: c,
    previous: p,
    delta: c != null && p != null ? Math.round((c - p) * 10) / 10 : null,
    lowerIsBetter,
  };
}

function coefficientOfVariation(m: AuditMetrics): number | null {
  if (m.stdDev == null || m.avgGlucose == null || m.avgGlucose <= 0) return null;
  return Math.round((m.stdDev / m.avgGlucose) * 100);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function buildHighlights(summary: {
  metrics: AuditMetrics;
  comparable: boolean;
  tirPercent: WeeklyDelta;
  activeDays: WeeklyDelta;
}): WeeklyHighlight[] {
  const { metrics, comparable, tirPercent, activeDays } = summary;
  const out: WeeklyHighlight[] = [];

  // 1. Hipoglicemia vem sempre primeiro e sempre aparece, mesmo isolada: é o
  // único evento da lista com risco imediato.
  if (metrics.hypoCount > 0) {
    out.push({
      id: "hypos",
      tone: "atencao",
      text:
        metrics.hypoCount === 1
          ? "1 leitura abaixo da sua meta mínima nesta semana. Vale anotar o horário e o que aconteceu antes — episódios repetidos são assunto de consulta."
          : `${metrics.hypoCount} leituras abaixo da sua meta mínima nesta semana. Anote os horários: um padrão (sempre de madrugada, sempre após exercício) é a informação que o médico precisa.`,
    });
  }

  if (metrics.severeHyperCount != null && metrics.severeHyperCount > 0) {
    out.push({
      id: "severe_hyper",
      tone: "atencao",
      text: `${metrics.severeHyperCount} leitura(s) em 250 mg/dL ou mais. Fora do padrão do resto da semana, costuma ter causa identificável — refeição, dose esquecida ou doença.`,
    });
  }

  // 2. Tendência de TIR, só quando as duas semanas sustentam a comparação.
  if (comparable && tirPercent.delta != null) {
    if (tirPercent.delta >= TIR_MEANINGFUL_POINTS) {
      out.push({
        id: "tir_up",
        tone: "bom",
        text: `Tempo no alvo subiu ${signed(tirPercent.delta)} pontos percentuais (${tirPercent.previous}% → ${tirPercent.current}%). O que você mudou nesta semana vale manter.`,
      });
    } else if (tirPercent.delta <= -TIR_MEANINGFUL_POINTS) {
      out.push({
        id: "tir_down",
        tone: "atencao",
        text: `Tempo no alvo caiu ${Math.abs(tirPercent.delta)} pontos percentuais (${tirPercent.previous}% → ${tirPercent.current}%). Compare com o que mudou na rotina: sono, refeições, horários de medicação.`,
      });
    } else {
      out.push({
        id: "tir_stable",
        tone: "info",
        text: `Tempo no alvo estável (${tirPercent.previous}% → ${tirPercent.current}%). Variação de até ${TIR_MEANINGFUL_POINTS} pontos entre semanas é oscilação normal.`,
      });
    }
  }

  // 3. Variabilidade: duas semanas com a mesma média podem ser muito diferentes.
  const cv = coefficientOfVariation(metrics);
  if (cv != null && cv >= HIGH_CV_PERCENT) {
    out.push({
      id: "variability",
      tone: "atencao",
      text: `Oscilação alta entre leituras (variação de ~${cv}% em torno da média). Duas semanas com a mesma média podem ser bem diferentes: quanto mais estável, melhor você se sente.`,
    });
  }

  // 4. Movimento: o hábito com efeito mais direto sobre a glicemia.
  if (metrics.activeDays >= 3) {
    out.push({
      id: "active",
      tone: "bom",
      text: `${metrics.activeDays} dias com pelo menos 15 min de atividade${
        comparable && activeDays.delta != null && activeDays.delta > 0
          ? ` (${signed(activeDays.delta)} em relação à semana passada)`
          : ""
      }.`,
    });
  } else if (metrics.activeDays === 0) {
    out.push({
      id: "sedentary",
      tone: "info",
      text: "Nenhum dia com atividade registrada. Caminhada curta depois das refeições é o ajuste de menor esforço com efeito mais rápido na glicemia.",
    });
  }

  // 5. Cobertura do próprio registro — sem isso o resto perde significado.
  if (metrics.daysWithGlucose < metrics.windowDays) {
    out.push({
      id: "coverage",
      tone: "info",
      text: `${metrics.daysWithGlucose} de ${metrics.windowDays} dias com leitura registrada. Os números acima descrevem só os dias com dado.`,
    });
  }

  return out;
}

export function buildWeeklySummary(input: {
  metrics: AuditMetrics;
  previousMetrics: AuditMetrics | null;
  periodStart: string;
  periodEnd: string;
  targetMin: number;
  targetMax: number;
}): WeeklySummary {
  const { metrics, previousMetrics } = input;
  const hasData = hasEnoughGlucoseData(metrics);
  const comparable = hasData && previousMetrics != null && hasEnoughGlucoseData(previousMetrics);

  const tirPercent = delta(metrics.tirPercent, previousMetrics?.tirPercent);
  const hypoCount = delta(metrics.hypoCount, previousMetrics?.hypoCount, true);
  const activeDays = delta(metrics.activeDays, previousMetrics?.activeDays);

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    targetMin: input.targetMin,
    targetMax: input.targetMax,
    metrics,
    previousMetrics,
    hasData,
    comparable,
    tirPercent,
    avgGlucose: delta(metrics.avgGlucose, previousMetrics?.avgGlucose),
    hypoCount,
    hyperCount: delta(metrics.hyperCount, previousMetrics?.hyperCount, true),
    severeHyperCount: delta(metrics.severeHyperCount, previousMetrics?.severeHyperCount, true),
    activeDays,
    avgCarbsPerDay: delta(metrics.avgCarbsPerDay, previousMetrics?.avgCarbsPerDay),
    waterDays: delta(metrics.waterDays, previousMetrics?.waterDays),
    highlights: buildHighlights({ metrics, comparable, tirPercent, activeDays }),
  };
}

function fmtDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR");
}

function line(label: string, d: WeeklyDelta, unit = ""): string {
  if (d.current == null) return `- ${label}: sem registro`;
  const comparison =
    d.delta == null
      ? ""
      : d.delta === 0
        ? " (igual à semana anterior)"
        : ` (${signed(d.delta)}${unit} vs. semana anterior)`;
  return `- ${label}: ${d.current}${unit}${comparison}`;
}

/**
 * Versão em texto do resumo, para copiar e colar (WhatsApp, e-mail, bloco de
 * notas). Texto puro de propósito: é o formato que sobrevive a qualquer app,
 * e a exportação existe justamente para levar a semana a quem não usa o GLYX.
 */
export function weeklySummaryText(s: WeeklySummary): string {
  const header = `GLYX — resumo da semana (${fmtDate(s.periodStart)} a ${fmtDate(s.periodEnd)})`;

  if (!s.hasData) {
    return [
      header,
      "",
      `Dados insuficientes para resumir a semana: ${s.metrics.readingCount} leitura(s) em ${s.metrics.daysWithGlucose} dia(s).`,
      `Mínimo para uma leitura com significado: ${MIN_READINGS_FOR_ANALYSIS} leituras em ${MIN_DAYS_FOR_ANALYSIS} dias.`,
    ].join("\n");
  }

  const parts = [
    header,
    "",
    `Faixa alvo: ${s.targetMin}–${s.targetMax} mg/dL`,
    "",
    "GLICEMIA",
    line("Tempo no alvo", s.tirPercent, "%"),
    line("Glicemia média", s.avgGlucose, " mg/dL"),
    line("Leituras abaixo da meta", s.hypoCount),
    line("Leituras acima da meta", s.hyperCount),
    line("Leituras ≥ 250 mg/dL", s.severeHyperCount),
    `- Cobertura: ${s.metrics.readingCount} leituras em ${s.metrics.daysWithGlucose} de ${s.metrics.windowDays} dias`,
    "",
    "HÁBITOS",
    line("Dias com atividade (≥15 min)", s.activeDays),
    line("Carboidrato médio por dia", s.avgCarbsPerDay, " g"),
    line("Dias com água registrada", s.waterDays),
  ];

  if (s.highlights.length) {
    parts.push("", "DESTAQUES");
    for (const h of s.highlights) parts.push(`- ${h.text}`);
  }

  if (!s.comparable && s.previousMetrics) {
    parts.push(
      "",
      "A semana anterior não tinha registros suficientes para comparação — os números acima são só desta semana."
    );
  }

  parts.push(
    "",
    "Resumo educativo de autocuidado gerado pelo GLYX. Não é laudo, não substitui avaliação médica e não deve orientar mudança de dose por conta própria."
  );

  return parts.join("\n");
}
