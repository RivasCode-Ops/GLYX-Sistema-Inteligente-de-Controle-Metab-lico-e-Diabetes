/**
 * Alertas de composição corporal — determinísticos, calculados em TypeScript.
 *
 * Por que não pedir isso à IA: os alertas são a superfície que empurra o
 * usuário a mudar treino e dieta. Precisam ser reprodutíveis, testáveis e
 * iguais toda vez para o mesmo dado — três coisas que um modelo de linguagem
 * não garante. A IA entra depois, para interpretar e escrever o relatório, com
 * estes números já prontos como âncora (mesmo padrão do resto do app: a
 * aritmética não é confiada ao modelo).
 *
 * Nenhum alerta prescreve dieta ou dose. Quando a conduta natural seria mexer
 * em alimentação e o usuário toma insulina ou secretagogo, o texto manda falar
 * com o médico antes — é a mesma barreira do resto do GLYX.
 */

import {
  BODY_FIELD_BY_KEY,
  measurementValue,
  type BodyMeasurement,
  type BodyMeasurementKey,
} from "@/lib/body/fields";
import { NOISE_FLOOR_CM, type BodyProgress } from "@/lib/body/progress";
import type { GoalProgress } from "@/lib/body/goals";
import type { GroupVolume } from "@/lib/exercicios/weekly-volume";
import { bilateralAsymmetryPercent, waistToHeightBand, type BodyComposition } from "@/lib/body/composition";
import type { MuscleGroupId } from "@/lib/data/muscle-groups";

export type BodyAlertTone = "otimo" | "bom" | "atencao" | "info";

export type BodyAlert = {
  id: string;
  title: string;
  body: string;
  tone: BodyAlertTone;
  href?: string;
};

/** Qual músculo treina qual medida — usado para cruzar meta de medida com volume de treino. */
export const MEASURE_TO_MUSCLE: Partial<Record<BodyMeasurementKey, MuscleGroupId[]>> = {
  chest_cm: ["peito"],
  shoulders_cm: ["ombros"],
  arm_right_relaxed_cm: ["biceps", "triceps"],
  arm_left_relaxed_cm: ["biceps", "triceps"],
  arm_right_flexed_cm: ["biceps", "triceps"],
  arm_left_flexed_cm: ["biceps", "triceps"],
  forearm_cm: ["antebracos"],
  thigh_right_cm: ["quadriceps", "posterior"],
  thigh_left_cm: ["quadriceps", "posterior"],
  calf_right_cm: ["panturrilhas"],
  calf_left_cm: ["panturrilhas"],
  waist_cm: ["abdomen"],
  abdomen_cm: ["abdomen"],
};

/** Janela padrão para considerar uma medida "parada". */
export const STAGNATION_WEEKS = 8;

export type StagnantMeasure = {
  key: BodyMeasurementKey;
  label: string;
  weeks: number;
  delta: number;
};

/**
 * Medidas de músculo que não saíram do lugar na janela — só conta quando existe
 * medição no começo E no fim dela, senão "parado" é só falta de registro.
 */
export function findStagnantMeasures(
  history: BodyMeasurement[],
  keys: BodyMeasurementKey[],
  weeks: number = STAGNATION_WEEKS,
  now: Date = new Date()
): StagnantMeasure[] {
  const cutoff = new Date(now.getTime() - weeks * 7 * 86_400_000).toISOString().slice(0, 10);
  const sorted = [...history].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const out: StagnantMeasure[] = [];

  for (const key of keys) {
    const withValue = sorted.filter((m) => measurementValue(m, key) != null);
    if (withValue.length < 2) continue;

    // A medição mais RECENTE anterior ao corte, não a mais antiga do histórico.
    // `.find()` numa lista ascendente devolveria a primeira de todas: com um ano
    // de medições, a comparação viraria "hoje contra um ano atrás", a variação
    // passaria do piso de ruído e a estagnação dos últimos dois meses — que é o
    // que este alerta existe para pegar — nunca apareceria.
    const old = withValue.filter((m) => m.measured_on <= cutoff).at(-1);
    const latest = withValue[withValue.length - 1];
    if (!old || old.measured_on === latest.measured_on) continue;

    const from = measurementValue(old, key)!;
    const to = measurementValue(latest, key)!;
    const delta = Math.round((to - from) * 10) / 10;
    if (Math.abs(delta) >= NOISE_FLOOR_CM) continue;

    const spanDays =
      (new Date(`${latest.measured_on}T12:00:00Z`).getTime() -
        new Date(`${old.measured_on}T12:00:00Z`).getTime()) /
      86_400_000;

    out.push({
      key,
      label: BODY_FIELD_BY_KEY[key].label,
      weeks: Math.round(spanDays / 7),
      delta,
    });
  }

  return out;
}

export type AlertInput = {
  progress: BodyProgress | null;
  goals: GoalProgress[];
  volume: GroupVolume[];
  history: BodyMeasurement[];
  latestComposition: BodyComposition | null;
  latestMeasurement: BodyMeasurement | null;
  /** Usa insulina ou secretagogo — muda o texto de qualquer sugestão alimentar. */
  glucoseLoweringMeds: boolean;
  now?: Date;
};

export function buildBodyAlerts(input: AlertInput): BodyAlert[] {
  const { progress, goals, volume, history, latestComposition, latestMeasurement } = input;
  const now = input.now ?? new Date();
  const alerts: BodyAlert[] = [];

  // 1. Leitura da evolução — o alerta mais importante, sempre primeiro.
  if (progress) {
    alerts.push({
      id: `progress_${progress.verdict.id}`,
      title: progress.verdict.headline,
      body: progress.verdict.detail,
      tone:
        progress.verdict.tone === "otimo"
          ? "otimo"
          : progress.verdict.tone === "bom"
            ? "bom"
            : progress.verdict.tone === "atencao"
              ? "atencao"
              : "info",
      href: "/composicao/historico",
    });
  }

  // 2. Volume insuficiente onde existe meta — cruzamento que responde
  // "meu treino está compatível com o que eu quero do meu corpo?".
  const volumeById = new Map(volume.map((v) => [v.id, v]));
  const goalMuscles = new Set<MuscleGroupId>();
  for (const goal of goals) {
    if (goal.achieved || goal.direction !== "increase") continue;
    for (const muscle of MEASURE_TO_MUSCLE[goal.key] ?? []) goalMuscles.add(muscle);
  }

  for (const muscle of goalMuscles) {
    const v = volumeById.get(muscle);
    if (!v || (v.status !== "insuficiente" && v.status !== "sem_registro")) continue;
    alerts.push({
      id: `volume_goal_${muscle}`,
      title: `Volume de ${v.label.toLowerCase()} abaixo do necessário para sua meta`,
      body:
        v.status === "sem_registro"
          ? `Você tem meta de medida que depende de ${v.label.toLowerCase()}, mas não há série registrada desse grupo no período. Referência geral: ${v.minTarget}-${v.optimalTarget} séries por semana.`
          : `${v.setsPerWeek} séries/semana registradas para ${v.label.toLowerCase()} — a referência para crescimento fica entre ${v.minTarget} e ${v.optimalTarget}.`,
      tone: "atencao",
      href: "/exercicios/plano",
    });
  }

  // 3. Volume insuficiente sem meta associada: informativo, tom mais leve.
  for (const v of volume) {
    if (v.status !== "insuficiente" || goalMuscles.has(v.id)) continue;
    alerts.push({
      id: `volume_${v.id}`,
      title: `Volume semanal de ${v.label.toLowerCase()} baixo`,
      body: `${v.setsPerWeek} séries/semana no período (referência: ${v.minTarget}-${v.optimalTarget}).`,
      tone: "info",
      href: "/exercicios/plano",
    });
  }

  // 4. Volume alto demais: recuperação é onde o músculo cresce.
  for (const v of volume) {
    if (v.status !== "alto") continue;
    alerts.push({
      id: `volume_alto_${v.id}`,
      title: `Volume de ${v.label.toLowerCase()} bem acima da referência`,
      body: `${v.setsPerWeek} séries/semana contra ${v.optimalTarget} de referência. Volume alto sem recuperação proporcional atrapalha mais do que ajuda.`,
      tone: "info",
      href: "/exercicios/recuperacao",
    });
  }

  // 5. Medidas paradas há semanas (só as que são meta de crescimento).
  const growthKeys = goals
    .filter((g) => g.direction === "increase" && !g.achieved)
    .map((g) => g.key);
  for (const stagnant of findStagnantMeasures(history, growthKeys, STAGNATION_WEEKS, now)) {
    alerts.push({
      id: `stagnant_${stagnant.key}`,
      title: `${stagnant.label} praticamente sem mudança há ${stagnant.weeks} semanas`,
      body: `Variação de ${stagnant.delta} cm no período, dentro da margem de erro da fita. Estagnação costuma pedir mudança de estímulo (carga, volume ou frequência) — ou mais tempo em superávit calórico.`,
      tone: "atencao",
      href: "/exercicios/plano",
    });
  }

  // 6. Assimetria entre lados.
  if (latestMeasurement) {
    const pairs: [BodyMeasurementKey, BodyMeasurementKey, string][] = [
      ["arm_right_flexed_cm", "arm_left_flexed_cm", "braços"],
      ["thigh_right_cm", "thigh_left_cm", "coxas"],
      ["calf_right_cm", "calf_left_cm", "panturrilhas"],
    ];
    for (const [right, left, label] of pairs) {
      const asym = bilateralAsymmetryPercent(latestMeasurement, right, left);
      if (asym == null || asym < 5) continue;
      alerts.push({
        id: `asymmetry_${label}`,
        title: `Diferença de ${asym}% entre os ${label}`,
        body: "Assimetria acima de 5% costuma ser dominância de lado na execução. Trabalho unilateral e atenção à técnica ajudam; dor ou perda de força de um lado só é assunto para avaliação profissional.",
        tone: "info",
        href: "/composicao/medidas",
      });
    }
  }

  // 7. Risco cardiometabólico pela relação cintura/altura — o alerta com mais
  // consequência clínica no contexto de diabetes.
  const band = waistToHeightBand(latestComposition?.waistToHeight ?? null);
  if (band && band.tone !== "ok") {
    alerts.push({
      id: "waist_height_risk",
      title:
        band.tone === "alto"
          ? "Relação cintura/altura em faixa de risco alto"
          : "Relação cintura/altura acima do recomendado",
      body: `Sua cintura está em ${latestComposition!.waistToHeight} da sua altura (referência: manter abaixo de 0,5). Gordura abdominal tem relação direta com resistência à insulina.${
        input.glucoseLoweringMeds
          ? " Como você usa medicação que baixa a glicemia, qualquer mudança de dieta precisa passar pelo seu médico antes."
          : ""
      }`,
      tone: "atencao",
      href: "/composicao",
    });
  }

  // 8. Metas fora de rota pela data alvo.
  for (const goal of goals) {
    if (goal.onTrack !== false || goal.achieved) continue;
    alerts.push({
      id: `goal_off_track_${goal.key}`,
      title: `Meta de ${goal.label.toLowerCase()} atrasada frente à data escolhida`,
      body: `No ritmo atual (${goal.ratePerWeek} ${goal.unit}/semana), a projeção cai depois da data que você definiu. Ajustar o prazo é tão válido quanto acelerar o ritmo.`,
      tone: "info",
      href: "/composicao/metas",
    });
  }

  return alerts;
}
