/**
 * Metas por medida: quanto já andou, em que ritmo, e quando chega se o ritmo
 * se mantiver ("se eu continuar nesse ritmo, quando atinjo 34 cm de braço?").
 *
 * O progresso é medido contra `start_value` congelado na criação da meta, não
 * contra a medição mais antiga disponível. Sem isso a régua anda junto com o
 * resultado: apagar uma medição antiga, ou registrar uma nova mais antiga,
 * mudaria retroativamente o "quanto você já andou".
 *
 * Projeção é aritmética simples e honesta sobre o ritmo observado — nunca
 * promessa. Corpo não evolui em linha reta, e o texto diz isso.
 */

import {
  BODY_FIELD_BY_KEY,
  measurementValue,
  type BodyMeasurement,
  type BodyMeasurementKey,
} from "@/lib/body/fields";
import { NOISE_FLOOR_CM, NOISE_FLOOR_KG } from "@/lib/body/progress";

export type BodyGoalRow = {
  metric: string;
  target_value: number;
  start_value: number | null;
  start_on: string;
  target_date: string | null;
};

export type GoalDirection = "increase" | "decrease";

export type GoalProgress = {
  key: BodyMeasurementKey;
  label: string;
  short: string;
  unit: "kg" | "cm" | "mm";
  start: number | null;
  current: number | null;
  target: number;
  direction: GoalDirection;
  /** 0-100, limitado — meta batida com folga não vira 140%. */
  progressPercent: number | null;
  /** Quanto falta, sempre positivo (0 = meta atingida). */
  remaining: number | null;
  achieved: boolean;
  /** Ritmo observado na direção da meta (unidade/semana); negativo = indo pro lado errado. */
  ratePerWeek: number | null;
  weeksToTarget: number | null;
  etaDate: string | null;
  targetDate: string | null;
  /** No ritmo atual, chega até a data-meta? `null` quando não há data ou ritmo. */
  onTrack: boolean | null;
};

/** Mínimo de dias entre a primeira e a última medição para estimar ritmo. */
const MIN_DAYS_FOR_RATE = 21;
/** Projeções acima disso viram "ritmo insuficiente" — 5 anos não é plano, é ficção. */
const MAX_PROJECTION_WEEKS = 260;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime();
  return ms / 86_400_000;
}

function addDays(from: string, days: number): string {
  const d = new Date(`${from}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function noiseFloorFor(unit: "kg" | "cm" | "mm"): number {
  return unit === "kg" ? NOISE_FLOOR_KG : unit === "cm" ? NOISE_FLOOR_CM : 2;
}

/**
 * Ritmo na direção da meta (unidade por semana), a partir da primeira e da
 * última medição disponíveis da série. Regressão completa seria mais elegante,
 * mas com 3-6 pontos mensais a diferença é menor que o erro da fita — e ponta a
 * ponta é o que o usuário consegue conferir na tela.
 */
export function observedRatePerWeek(
  history: BodyMeasurement[],
  key: BodyMeasurementKey,
  direction: GoalDirection
): number | null {
  const points = history
    .map((m) => ({ date: m.measured_on, value: measurementValue(m, key) }))
    .filter((p): p is { date: string; value: number } => p.value != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const days = daysBetween(first.date, last.date);
  if (days < MIN_DAYS_FOR_RATE) return null;

  const signedDelta = last.value - first.value;

  // Mudança total dentro do erro de medição não tem ritmo: dividir ruído pelo
  // tempo produz um número pequeno e convincente, e dele sairia uma previsão
  // de data inventada. Sem mudança mensurável, sem projeção.
  const field = BODY_FIELD_BY_KEY[key];
  if (field && Math.abs(signedDelta) < noiseFloorFor(field.unit)) return null;

  const towardGoal = direction === "increase" ? signedDelta : -signedDelta;
  return Math.round((towardGoal / days) * 7 * 100) / 100;
}

export function computeGoalProgress(
  goal: BodyGoalRow,
  history: BodyMeasurement[]
): GoalProgress | null {
  const key = goal.metric as BodyMeasurementKey;
  const field = BODY_FIELD_BY_KEY[key];
  if (!field) return null;

  const sorted = [...history].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const latestWithValue = [...sorted].reverse().find((m) => measurementValue(m, key) != null);
  const current = latestWithValue ? measurementValue(latestWithValue, key) : null;

  // Sem start_value gravado (meta criada antes de existir medição), a primeira
  // medição registrada serve de partida — explicitamente, não por acidente.
  const start =
    goal.start_value ??
    (sorted.map((m) => measurementValue(m, key)).find((v) => v != null) ?? null);

  const direction: GoalDirection =
    start != null ? (goal.target_value >= start ? "increase" : "decrease") : "increase";

  const span = start != null ? Math.abs(goal.target_value - start) : null;
  const walked =
    start != null && current != null
      ? direction === "increase"
        ? current - start
        : start - current
      : null;

  const progressPercent =
    span != null && span > 0 && walked != null
      ? Math.max(0, Math.min(100, Math.round((walked / span) * 100)))
      : null;

  const remainingSigned =
    current != null
      ? direction === "increase"
        ? goal.target_value - current
        : current - goal.target_value
      : null;
  const achieved = remainingSigned != null && remainingSigned <= 0;
  const remaining = remainingSigned != null ? Math.max(0, round1(remainingSigned)) : null;

  const ratePerWeek = observedRatePerWeek(sorted, key, direction);

  let weeksToTarget: number | null = null;
  if (!achieved && remaining != null && ratePerWeek != null && ratePerWeek > 0) {
    const weeks = remaining / ratePerWeek;
    weeksToTarget = weeks <= MAX_PROJECTION_WEEKS ? Math.ceil(weeks) : null;
  }

  const etaDate =
    weeksToTarget != null && latestWithValue
      ? addDays(latestWithValue.measured_on, weeksToTarget * 7)
      : null;

  const onTrack =
    goal.target_date == null || etaDate == null ? null : etaDate <= goal.target_date;

  return {
    key,
    label: field.label,
    short: field.short,
    unit: field.unit,
    start: start != null ? round1(start) : null,
    current: current != null ? round1(current) : null,
    target: goal.target_value,
    direction,
    progressPercent: achieved ? 100 : progressPercent,
    remaining,
    achieved,
    ratePerWeek,
    weeksToTarget,
    etaDate,
    targetDate: goal.target_date,
    onTrack,
  };
}

export function computeAllGoalProgress(
  goals: BodyGoalRow[],
  history: BodyMeasurement[]
): GoalProgress[] {
  return goals
    .map((g) => computeGoalProgress(g, history))
    .filter((g): g is GoalProgress => g !== null);
}

/** Frase de projeção pronta — inclui a ressalva de ritmo, que não é opcional. */
export function projectionMessage(g: GoalProgress): string {
  if (g.achieved) return `Meta atingida: ${g.current} ${g.unit}.`;
  if (g.ratePerWeek == null) {
    return `Faltam ${g.remaining} ${g.unit}. Ainda não dá pra projetar prazo — são necessárias medições separadas por pelo menos ${MIN_DAYS_FOR_RATE} dias.`;
  }
  if (g.ratePerWeek <= 0) {
    return `Faltam ${g.remaining} ${g.unit}, mas a medida está indo na direção oposta à meta no período analisado.`;
  }
  if (g.weeksToTarget == null) {
    return `Faltam ${g.remaining} ${g.unit}. No ritmo atual (${g.ratePerWeek} ${g.unit}/semana) a projeção passaria de 5 anos — na prática, é ritmo insuficiente para essa meta.`;
  }
  const meses = Math.round((g.weeksToTarget / 4.35) * 10) / 10;
  return `Faltam ${g.remaining} ${g.unit}. No ritmo observado (${g.ratePerWeek} ${g.unit}/semana), cerca de ${g.weeksToTarget} semanas (~${meses} meses), por volta de ${new Date(`${g.etaDate}T12:00:00Z`).toLocaleDateString("pt-BR")}. Projeção linear: corpo não evolui em linha reta, então trate como ordem de grandeza.`;
}
