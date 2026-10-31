/**
 * Veredito de viabilidade de meta corporal — por REGRA (Etapa 2, C10).
 *
 * Até 30/10/2026 o veredito ("realista | agressiva | arriscada") e os marcos
 * mensais de peso saíam do modelo de IA, com as regras escritas no prompt. O
 * mesmo perfil podia receber vereditos diferentes em duas chamadas, e número
 * de peso inventado chegava à tela. Agora o veredito e os marcos são calculados
 * aqui, com os critérios que o prompt já declarava; o modelo só redige.
 *
 * Critérios (os do prompt anterior, explicitados — registrados para validação, D7):
 * - **arriscada**: peso-meta com IMC abaixo de 18,5, ou meta na direção oposta
 *   ao objetivo (perder peso com meta acima do peso atual, e vice-versa);
 * - **agressiva**: a distância até a meta não cabe em 6 meses no ritmo seguro
 *   (`safeWeeklyRateKg`, ADA: 0,5–1%/semana) — os marcos param no 6º mês;
 * - **realista**: o resto, inclusive sem peso-meta declarado (o plano segue o
 *   ritmo seguro).
 */

import { safeWeeklyRateKg, type BodyGoal } from "@/lib/health/energy";

export type GoalVerdict = "realista" | "agressiva" | "arriscada";

export const IMC_MINIMO = 18.5;
export const HORIZONTE_MESES = 6;
const SEMANAS_POR_MES = 4.345;

export type GoalFeasibility = {
  verdict: GoalVerdict;
  /** Motivo do veredito, em uma frase — vai ao prompt e à tela. */
  motivo: string;
  weeklyRateKg: number;
  /** Semanas até a meta no ritmo seguro; null sem meta ou sem ritmo. */
  semanasAteMeta: number | null;
  monthlyMilestones: { month: number; weight_kg: number }[];
};

function imc(pesoKg: number, alturaCm: number): number {
  const m = alturaCm / 100;
  return pesoKg / (m * m);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function assessGoalFeasibility(input: {
  weightKg: number;
  heightCm: number;
  goal: BodyGoal;
  targetWeightKg: number | null;
}): GoalFeasibility {
  const { weightKg, heightCm, goal } = input;
  const rate = safeWeeklyRateKg(weightKg, goal);
  const alvo = input.targetWeightKg != null && input.targetWeightKg > 0 ? input.targetWeightKg : null;
  const sentido = goal === "lose" ? -1 : goal === "gain" ? 1 : 0;

  const marcos: GoalFeasibility["monthlyMilestones"] = [];
  for (let mes = 1; mes <= HORIZONTE_MESES; mes++) {
    let peso = weightKg + sentido * rate * SEMANAS_POR_MES * mes;
    if (alvo != null && sentido !== 0) {
      peso = sentido < 0 ? Math.max(peso, alvo) : Math.min(peso, alvo);
    }
    marcos.push({ month: mes, weight_kg: r1(peso) });
  }

  const base = { weeklyRateKg: rate, monthlyMilestones: marcos };

  if (alvo == null) {
    return {
      ...base,
      verdict: "realista",
      motivo: "Sem peso-meta declarado: o plano segue o ritmo seguro.",
      semanasAteMeta: null,
    };
  }

  if (imc(alvo, heightCm) < IMC_MINIMO) {
    return {
      ...base,
      verdict: "arriscada",
      motivo: `O peso-meta de ${alvo} kg corresponde a IMC abaixo de ${IMC_MINIMO}.`,
      semanasAteMeta: null,
    };
  }

  const delta = alvo - weightKg;
  if ((sentido < 0 && delta > 0) || (sentido > 0 && delta < 0)) {
    return {
      ...base,
      verdict: "arriscada",
      motivo: `O peso-meta de ${alvo} kg vai na direção contrária ao objetivo declarado.`,
      semanasAteMeta: null,
    };
  }

  if (sentido === 0 || rate <= 0) {
    return {
      ...base,
      verdict: "realista",
      motivo: "Objetivo de composição/manutenção: o peso total esperado fica estável.",
      semanasAteMeta: null,
    };
  }

  const semanas = Math.ceil(Math.abs(delta) / rate);
  if (semanas > HORIZONTE_MESES * SEMANAS_POR_MES) {
    return {
      ...base,
      verdict: "agressiva",
      motivo: `No ritmo seguro (${rate} kg/semana), a meta levaria cerca de ${semanas} semanas — mais que ${HORIZONTE_MESES} meses.`,
      semanasAteMeta: semanas,
    };
  }

  return {
    ...base,
    verdict: "realista",
    motivo: `No ritmo seguro (${rate} kg/semana), a meta cabe em cerca de ${semanas} semanas.`,
    semanasAteMeta: semanas,
  };
}
