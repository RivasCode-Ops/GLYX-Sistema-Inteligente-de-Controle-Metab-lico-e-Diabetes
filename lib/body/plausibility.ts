import { NOISE_FLOOR_CM, NOISE_FLOOR_KG } from "@/lib/body/progress";
import type { BodyMeasurement, BodyMeasurementKey } from "@/lib/body/fields";
import { measurementValue } from "@/lib/body/fields";

/**
 * Filtro de plausibilidade na ENTRADA — o que o app engoliu sem piscar.
 *
 * ---------------------------------------------------------------------------
 * O CASO
 * ---------------------------------------------------------------------------
 * Medições reais do usuário, em 15 dias:
 *
 *   peitoral   110 → 100 → 110 → 100   (10 cm de oscilação, uma delas em 2 dias)
 *   ombros     112 → 140 → 110         (28 cm em 8 dias)
 *   antebraço   18 →  29 →  30         (11 cm em 8 dias)
 *
 * Nenhuma dessas variações é fisiológica: são erro de fita ou de digitação. E o
 * app não só as aceitou como **prescreveu em cima delas** — `/exercicios/plano`
 * mandava 8 séries de peito porque "faltam 14 cm" para a meta, número que só
 * existe porque a última medição de peitoral caiu 10 cm.
 *
 * O mesmo app que escreve "fita métrica erra ~1 cm" em `progress.ts` e recusa
 * afirmar variação abaixo desse piso aceitava dez vezes isso na direção
 * contrária. Rigoroso quando falta dado, ingênuo quando o dado está errado.
 *
 * ---------------------------------------------------------------------------
 * O CRITÉRIO É TAXA, NÃO VALOR ABSOLUTO
 * ---------------------------------------------------------------------------
 * Uma tabela de "braço plausível entre X e Y cm" precisaria de sexo, altura,
 * estrutura e histórico de treino — e erraria em quem foge da média, que é
 * justamente quem mais mede. A taxa não precisa de nada disso: **circunferência
 * muscular não muda 10 cm em dois dias em ninguém.**
 *
 * O teto é generoso de propósito (2 cm por semana, contra ~0,5 cm/semana de um
 * ganho rápido real). O objetivo não é julgar o treino de ninguém: é pegar erro
 * grosseiro de digitação e de fita, deixando passar qualquer progresso humano.
 */

/** Variação máxima aceita por semana, em cm, para circunferências. */
export const MAX_CM_PER_WEEK = 2;

/** Variação máxima aceita por semana, em kg. Perda/ganho de 1 kg/semana já é
 *  rápido; 3 dá folga para retenção hídrica e balança diferente. */
export const MAX_KG_PER_WEEK = 3;

export type Suspicion = {
  key: BodyMeasurementKey;
  from: number;
  to: number;
  delta: number;
  days: number;
  /** Quanto seria aceitável nesse intervalo. */
  allowed: number;
};

function limite(days: number, isWeight: boolean): number {
  const semanas = Math.max(days, 1) / 7;
  const piso = isWeight ? NOISE_FLOOR_KG : NOISE_FLOOR_CM;
  const taxa = (isWeight ? MAX_KG_PER_WEEK : MAX_CM_PER_WEEK) * semanas;
  // O piso de ruído entra porque em intervalo curto a taxa fica menor que o
  // erro da própria fita — e aí o filtro reprovaria medição correta.
  return Math.max(piso, taxa);
}

/**
 * Medições cuja variação em relação à ANTERIOR é fisicamente improvável.
 *
 * Compara cada medição com a imediatamente anterior que tenha aquele campo.
 * Não julga a série inteira: um valor errado no meio produz duas suspeitas
 * (entrada e saída), e é isso mesmo — as duas transições são impossíveis.
 */
export function findImplausible(
  history: BodyMeasurement[],
  keys: BodyMeasurementKey[]
): Suspicion[] {
  const ordenado = [...history].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const out: Suspicion[] = [];

  for (const key of keys) {
    const comValor = ordenado.filter((m) => measurementValue(m, key) != null);
    for (let i = 1; i < comValor.length; i++) {
      const antes = comValor[i - 1];
      const depois = comValor[i];
      const de = measurementValue(antes, key)!;
      const para = measurementValue(depois, key)!;
      const dias = Math.round(
        (new Date(`${depois.measured_on}T12:00:00Z`).getTime() -
          new Date(`${antes.measured_on}T12:00:00Z`).getTime()) /
          86_400_000
      );
      const teto = limite(dias, key === "weight_kg");
      const delta = Math.round((para - de) * 10) / 10;
      if (Math.abs(delta) > teto) {
        out.push({
          key,
          from: de,
          to: para,
          delta,
          days: dias,
          allowed: Math.round(teto * 10) / 10,
        });
      }
    }
  }
  return out;
}

/**
 * A medição é confiável para este campo?
 *
 * Usada por quem CALCULA em cima do valor — meta e prescrição de treino. Uma
 * medida que participou de uma transição impossível não deve virar "faltam 14
 * cm para a meta" nem "8 séries de peito".
 */
export function isSuspect(
  suspicions: Suspicion[],
  key: BodyMeasurementKey,
  value: number
): boolean {
  return suspicions.some((s) => s.key === key && (s.to === value || s.from === value));
}
