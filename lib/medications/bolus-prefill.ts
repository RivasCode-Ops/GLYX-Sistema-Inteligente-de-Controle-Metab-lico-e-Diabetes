import { readingAge, type Freshness } from "@/lib/health/reading-freshness";

/**
 * O que a calculadora de bolus faz com a última leitura (GLYX-28 / P15).
 *
 * Antes, a última glicemia gravada entrava no campo "Glicemia atual" sem data —
 * uma leitura de três semanas atrás virava correção de dose de agora. A fórmula
 * e o teto não mudam aqui; muda só o que chega pré-preenchido.
 *
 * Regra: pré-preenche apenas leitura `fresh` (até 20 min, o mesmo corte que o
 * painel usa para dizer "atual"). Qualquer outra aparece como contexto, com a
 * idade, e o campo fica vazio para a pessoa medir ou digitar.
 */
export type BolusPrefill = {
  /** Valor que vai para o campo, ou null para deixar vazio. */
  value: number | null;
  /** Última leitura conhecida, sempre com a idade — null se não há leitura. */
  latest: { value: number; ageLabel: string; freshness: Freshness } | null;
};

export function bolusGlucosePrefill(
  reading: { value: number; recordedAt: string } | null,
  now: Date = new Date()
): BolusPrefill {
  if (!reading) return { value: null, latest: null };
  const idade = readingAge(reading.recordedAt, now);
  return {
    value: idade.freshness === "fresh" ? reading.value : null,
    latest: { value: reading.value, ageLabel: idade.label, freshness: idade.freshness },
  };
}
