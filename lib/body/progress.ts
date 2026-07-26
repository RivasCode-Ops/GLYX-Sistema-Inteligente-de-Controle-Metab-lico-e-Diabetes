/**
 * Evolução entre duas medições — o coração do "estou ganhando músculo ou
 * gordura?".
 *
 * Duas regras que valem para tudo aqui:
 *
 * 1. **Piso de ruído.** Fita métrica erra ~0,5-1 cm entre medições da mesma
 *    pessoa no mesmo dia (posição, tensão, hora); peso oscila 1-2 kg por água,
 *    sal, carboidrato e intestino. Diferença abaixo do piso é lida como
 *    "estável", nunca como evolução — senão o app comemora ruído e o usuário
 *    aprende a não confiar nele.
 * 2. **Não inventar a divisão músculo/gordura.** O split em kg só é calculado
 *    quando as duas datas têm % de gordura pelo MESMO método. Sem isso, a
 *    leitura é qualitativa (direção de peso × cintura × músculo), que é honesta
 *    e ainda responde a pergunta.
 */

import {
  BODY_FIELD_BY_KEY,
  BODY_FIELDS,
  measurementValue,
  type BodyMeasurement,
  type BodyMeasurementKey,
} from "@/lib/body/fields";
import { sameMethod, type BodyComposition } from "@/lib/body/composition";

/** Abaixo disto, a diferença é ruído de medição — não evolução. */
export const NOISE_FLOOR_KG = 0.5;
export const NOISE_FLOOR_CM = 1.0;
export const NOISE_FLOOR_MM = 2.0;

export type Direction = "up" | "down" | "stable";

export type MeasurementDelta = {
  key: BodyMeasurementKey;
  label: string;
  short: string;
  unit: "kg" | "cm" | "mm";
  from: number;
  to: number;
  delta: number;
  direction: Direction;
  /** `true` quando a mudança é do tamanho do erro de medição. */
  withinNoise: boolean;
};

export type ProgressTone = "otimo" | "bom" | "atencao" | "neutro";

export type ProgressVerdict = {
  id:
    | "recomposicao"
    | "ganho_magro"
    | "ganho_com_gordura"
    | "perda_de_gordura"
    | "perda_com_massa_magra"
    | "estavel";
  headline: string;
  detail: string;
  tone: ProgressTone;
};

export type BodyProgress = {
  fromDate: string;
  toDate: string;
  days: number;
  deltas: MeasurementDelta[];
  weightDeltaKg: number | null;
  waistDeltaCm: number | null;
  /** Média das variações das medidas de músculo que existem nas duas datas. */
  muscleDeltaCm: number | null;
  /** Split em kg — só com % de gordura pelo mesmo método nas duas datas. */
  leanDeltaKg: number | null;
  fatDeltaKg: number | null;
  splitIsEstimated: boolean;
  verdict: ProgressVerdict;
};

function noiseFloor(unit: "kg" | "cm" | "mm"): number {
  return unit === "kg" ? NOISE_FLOOR_KG : unit === "cm" ? NOISE_FLOOR_CM : NOISE_FLOOR_MM;
}

function directionOf(delta: number, floor: number): Direction {
  if (Math.abs(delta) < floor) return "stable";
  return delta > 0 ? "up" : "down";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Diferença de cada campo presente nas duas medições. Campo ausente em uma delas fica de fora. */
export function computeDeltas(from: BodyMeasurement, to: BodyMeasurement): MeasurementDelta[] {
  const out: MeasurementDelta[] = [];
  for (const field of BODY_FIELDS) {
    const a = measurementValue(from, field.key);
    const b = measurementValue(to, field.key);
    if (a == null || b == null) continue;
    const delta = round1(b - a);
    const floor = noiseFloor(field.unit);
    out.push({
      key: field.key,
      label: field.label,
      short: field.short,
      unit: field.unit,
      from: a,
      to: b,
      delta,
      direction: directionOf(delta, floor),
      withinNoise: Math.abs(delta) < floor,
    });
  }
  return out;
}

/** Média das variações das medidas de papel "músculo" (peito, ombros, braços, coxas, panturrilhas). */
function muscleDelta(deltas: MeasurementDelta[]): number | null {
  const muscle = deltas.filter((d) => BODY_FIELD_BY_KEY[d.key].role === "musculo");
  if (!muscle.length) return null;
  return round1(muscle.reduce((s, d) => s + d.delta, 0) / muscle.length);
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function fmtKg(n: number): string {
  return `${n > 0 ? "+" : ""}${round1(n).toString().replace(".", ",")} kg`;
}

function fmtCm(n: number): string {
  return `${n > 0 ? "+" : ""}${round1(n).toString().replace(".", ",")} cm`;
}

/**
 * Classificação da evolução.
 *
 * A leitura central é peso × cintura, porque é a única combinação que separa
 * ganho de músculo de ganho de gordura sem exame: subir de peso com cintura
 * estável ou menor é o padrão de ganho magro; subir com cintura junto é ganho
 * de gordura. As medidas de músculo entram como confirmação.
 */
function classify(input: {
  weightDeltaKg: number | null;
  waistDeltaCm: number | null;
  muscleDeltaCm: number | null;
  leanDeltaKg: number | null;
  fatDeltaKg: number | null;
}): ProgressVerdict {
  const { weightDeltaKg, waistDeltaCm, muscleDeltaCm, leanDeltaKg, fatDeltaKg } = input;

  const weightDir =
    weightDeltaKg == null ? "stable" : directionOf(weightDeltaKg, NOISE_FLOOR_KG);
  const waistDir = waistDeltaCm == null ? null : directionOf(waistDeltaCm, NOISE_FLOOR_CM);
  const muscleDir =
    muscleDeltaCm == null ? null : directionOf(muscleDeltaCm, NOISE_FLOOR_CM);

  // Split medido tem prioridade sobre a inferência por direção.
  if (leanDeltaKg != null && fatDeltaKg != null) {
    if (leanDeltaKg >= NOISE_FLOOR_KG && fatDeltaKg <= -NOISE_FLOOR_KG) {
      return {
        id: "recomposicao",
        headline: "Recomposição corporal",
        detail: `Massa magra ${fmtKg(leanDeltaKg)} e gordura ${fmtKg(fatDeltaKg)} no período — ganhar músculo e perder gordura ao mesmo tempo é o resultado mais difícil de obter.`,
        tone: "otimo",
      };
    }
    if (leanDeltaKg >= NOISE_FLOOR_KG) {
      return {
        id: "ganho_magro",
        headline: "Ganho predominante de massa magra",
        detail: `Massa magra ${fmtKg(leanDeltaKg)} contra ${fmtKg(fatDeltaKg)} de gordura.`,
        tone: fatDeltaKg > Math.abs(leanDeltaKg) ? "atencao" : "bom",
      };
    }
    if (fatDeltaKg <= -NOISE_FLOOR_KG) {
      return {
        id: "perda_de_gordura",
        headline: "Perda de gordura",
        detail: `Gordura ${fmtKg(fatDeltaKg)} com massa magra ${leanDeltaKg >= -NOISE_FLOOR_KG ? "preservada" : `em ${fmtKg(leanDeltaKg)}`}.`,
        tone: leanDeltaKg >= -NOISE_FLOOR_KG ? "otimo" : "atencao",
      };
    }
    if (leanDeltaKg <= -NOISE_FLOOR_KG) {
      return {
        id: "perda_com_massa_magra",
        headline: "Perda de peso com queda de massa magra",
        detail: `Massa magra ${fmtKg(leanDeltaKg)}. Perder massa magra junto costuma indicar proteína ou estímulo de força insuficiente — vale revisar com quem acompanha seu treino e sua dieta.`,
        tone: "atencao",
      };
    }
  }

  if (weightDir === "up") {
    if (waistDir === "down") {
      return {
        id: "recomposicao",
        headline: "Recomposição corporal",
        detail: `Peso ${fmtKg(weightDeltaKg!)} com cintura ${fmtCm(waistDeltaCm!)}: ganhar peso reduzindo cintura é o padrão de ganho de músculo com perda de gordura.`,
        tone: "otimo",
      };
    }
    if (waistDir === "stable") {
      return {
        id: "ganho_magro",
        headline: "Ganho predominante de massa",
        detail: `Peso ${fmtKg(weightDeltaKg!)} com cintura estável${muscleDir === "up" ? ` e medidas de músculo em alta (${fmtCm(muscleDeltaCm!)} em média)` : ""}.`,
        tone: "bom",
      };
    }
    if (waistDir === "up") {
      return {
        id: "ganho_com_gordura",
        headline: "Ganho de peso com aumento de cintura",
        detail: `Peso ${fmtKg(weightDeltaKg!)} e cintura ${fmtCm(waistDeltaCm!)} — parte do ganho é provavelmente gordura. Em quem usa insulina ou secretagogo, mexer em dieta pede conversa com o médico antes.`,
        tone: "atencao",
      };
    }
    return {
      id: "ganho_magro",
      headline: "Ganho de peso",
      detail: `Peso ${fmtKg(weightDeltaKg!)}. Sem medida de cintura no período não dá pra dizer quanto é músculo e quanto é gordura — meça a cintura na próxima.`,
      tone: "neutro",
    };
  }

  if (weightDir === "down") {
    if (waistDir === "down") {
      return {
        id: "perda_de_gordura",
        headline: "Perda de gordura",
        detail: `Peso ${fmtKg(weightDeltaKg!)} com cintura ${fmtCm(waistDeltaCm!)}${muscleDir === "up" ? " e medidas de músculo mantidas ou em alta" : ""}.`,
        tone: muscleDir === "down" ? "atencao" : "otimo",
      };
    }
    if (muscleDir === "down") {
      return {
        id: "perda_com_massa_magra",
        headline: "Peso caindo com medidas de músculo em queda",
        detail: `Peso ${fmtKg(weightDeltaKg!)} e medidas de músculo ${fmtCm(muscleDeltaCm!)} em média, sem redução equivalente de cintura. Padrão de perda de massa magra.`,
        tone: "atencao",
      };
    }
    return {
      id: "perda_de_gordura",
      headline: "Perda de peso",
      detail: `Peso ${fmtKg(weightDeltaKg!)}, cintura sem mudança relevante — acompanhe mais uma medição antes de concluir.`,
      tone: "neutro",
    };
  }

  if (muscleDir === "up" && waistDir === "down") {
    return {
      id: "recomposicao",
      headline: "Recomposição corporal",
      detail: `Peso estável, cintura ${fmtCm(waistDeltaCm!)} e medidas de músculo ${fmtCm(muscleDeltaCm!)} em média: o corpo mudou mesmo com a balança parada.`,
      tone: "otimo",
    };
  }

  return {
    id: "estavel",
    headline: "Sem mudança relevante no período",
    detail:
      "As diferenças ficaram dentro da margem de erro da medição (0,5 kg / 1 cm). Isso é informação, não fracasso: significa manutenção.",
    tone: "neutro",
  };
}

/**
 * Compara duas medições. `from` deve ser a mais antiga — se vierem trocadas, a
 * função inverte, porque "evolução negativa" por erro de ordem já foi bug real
 * em tela de histórico neste projeto.
 */
export function computeProgress(
  from: { measurement: BodyMeasurement; composition: BodyComposition },
  to: { measurement: BodyMeasurement; composition: BodyComposition }
): BodyProgress {
  const ordered =
    from.measurement.measured_on <= to.measurement.measured_on ? [from, to] : [to, from];
  const [a, b] = ordered;

  const deltas = computeDeltas(a.measurement, b.measurement);
  const weightDeltaKg =
    a.composition.weightKg != null && b.composition.weightKg != null
      ? round1(b.composition.weightKg - a.composition.weightKg)
      : null;
  const waistDeltaCm = deltas.find((d) => d.key === "waist_cm")?.delta ?? null;

  const comparable = sameMethod(a.composition, b.composition);
  const leanDeltaKg =
    comparable && a.composition.leanMassKg != null && b.composition.leanMassKg != null
      ? round1(b.composition.leanMassKg - a.composition.leanMassKg)
      : null;
  const fatDeltaKg =
    comparable && a.composition.fatMassKg != null && b.composition.fatMassKg != null
      ? round1(b.composition.fatMassKg - a.composition.fatMassKg)
      : null;

  return {
    fromDate: a.measurement.measured_on,
    toDate: b.measurement.measured_on,
    days: daysBetween(a.measurement.measured_on, b.measurement.measured_on),
    deltas,
    weightDeltaKg,
    waistDeltaCm,
    muscleDeltaCm: muscleDelta(deltas),
    leanDeltaKg,
    fatDeltaKg,
    splitIsEstimated: leanDeltaKg != null,
    verdict: classify({
      weightDeltaKg,
      waistDeltaCm,
      muscleDeltaCm: muscleDelta(deltas),
      leanDeltaKg,
      fatDeltaKg,
    }),
  };
}

/**
 * Resumo em uma frase, no formato que o usuário pediu ("ganhou 1,2 kg, destes
 * 0,9 parecem massa magra, cintura -2 cm").
 */
export function progressSummary(p: BodyProgress): string {
  const parts: string[] = [];
  if (p.weightDeltaKg != null && Math.abs(p.weightDeltaKg) >= NOISE_FLOOR_KG) {
    parts.push(`peso ${fmtKg(p.weightDeltaKg)}`);
  }
  if (p.leanDeltaKg != null) {
    parts.push(`massa magra estimada ${fmtKg(p.leanDeltaKg)}`);
  }
  if (p.fatDeltaKg != null) {
    parts.push(`gordura estimada ${fmtKg(p.fatDeltaKg)}`);
  }
  if (p.waistDeltaCm != null && Math.abs(p.waistDeltaCm) >= NOISE_FLOOR_CM) {
    parts.push(`cintura ${fmtCm(p.waistDeltaCm)}`);
  }
  if (!parts.length) return p.verdict.headline;
  return `Em ${p.days} dias: ${parts.join(", ")}.`;
}
