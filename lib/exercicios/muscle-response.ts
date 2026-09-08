import type { MuscleGroupId } from "@/lib/data/muscle-groups";
import type { BodyMeasurement, BodyMeasurementKey } from "@/lib/body/fields";
import {
  MEASURE_TO_MUSCLE,
  isNoise,
  measureDeltaInWindow,
  type StagnantMeasure,
} from "@/lib/body/alerts";
import {
  shouldSuppressVolumeDiagnosis,
  type ExerciseProgression,
  type GroupVolume,
} from "@/lib/exercicios/weekly-volume";
import { resolveMuscleGroupIds } from "@/lib/data/muscle-groups";

/**
 * Resposta muscular — o cruzamento que faltava.
 *
 * O app já respondia duas perguntas separadas: "posso treinar este músculo
 * hoje?" (recuperação) e "este músculo recebe volume suficiente?" (volume). A
 * terceira — "este estímulo está produzindo resultado?" — só se responde
 * juntando três coisas que hoje moram em módulos diferentes:
 *
 * 1. VOLUME, de `weekly-volume.ts` — houve estímulo suficiente?
 * 2. PERFORMANCE, de `computeProgression` — a carga subiu?
 * 3. MEDIDA, de `body/alerts.ts` — a fita mudou?
 *
 * Nada aqui é recalculado: as três entram prontas. Esta função só decide o que
 * a combinação delas significa, e devolve o porquê junto do veredito.
 *
 * ---------------------------------------------------------------------------
 * A medida é CONFIRMAÇÃO, nunca decisor sozinho
 * ---------------------------------------------------------------------------
 * Fita tem ruído (`NOISE_FLOOR_CM`), muitos grupos não têm medida nenhuma
 * (costas, trapézio) e circunferência de braço muda com gordura também. Deixar
 * a fita decidir sozinha produziria "bíceps não responde" para quem ganhou
 * força e não tinha medição do mês passado. Ela entra para reforçar ou para
 * contradizer o que volume e performance já disseram — e quando contradiz, o
 * veredito é "revisar", não "negativa".
 */

export type RespostaVeredito =
  | "positiva"
  | "estimulo_insuficiente"
  | "revisar"
  | "sem_base";

export type RespostaMuscular = {
  id: MuscleGroupId;
  label: string;
  /** Séries diretas por semana e o status contra a faixa de referência. */
  volume: GroupVolume;
  /** Séries indiretas por semana — informa, e não entra na comparação com a meta. */
  indiretas: number;
  /**
   * Melhor variação de 1RM estimado entre os exercícios daquele músculo, em %.
   * `null` quando nenhum exercício do grupo tem carga registrada dos dois lados
   * da janela — e aí a ausência é a informação, não zero.
   */
  performancePct: number | null;
  /** Quantos exercícios do grupo entraram na conta de performance. */
  exercicios: number;
  /** Variação da medida corporal associada, quando existe. */
  medida: StagnantMeasure | null;
  veredito: RespostaVeredito;
  motivo: string;
};

/** Músculo → medidas de fita que o representam: o inverso de `MEASURE_TO_MUSCLE`. */
function medidasPorMusculo(): Map<MuscleGroupId, BodyMeasurementKey[]> {
  const out = new Map<MuscleGroupId, BodyMeasurementKey[]>();
  for (const [key, musculos] of Object.entries(MEASURE_TO_MUSCLE)) {
    for (const m of musculos ?? []) {
      const atual = out.get(m) ?? [];
      atual.push(key as BodyMeasurementKey);
      out.set(m, atual);
    }
  }
  return out;
}

/**
 * A medida mais representativa do grupo na janela: entre as candidatas, a de
 * maior variação absoluta com medição dos dois lados.
 *
 * Cintura e abdômen ficam de fora de propósito — são medidas de gordura, e
 * "abdômen cresceu" não é resposta de hipertrofia do abdômen.
 */
const MEDIDAS_DE_GORDURA: BodyMeasurementKey[] = ["waist_cm", "abdomen_cm"];

function medidaDoGrupo(
  id: MuscleGroupId,
  mapa: Map<MuscleGroupId, BodyMeasurementKey[]>,
  history: BodyMeasurement[],
  weeks: number,
  now: Date
): StagnantMeasure | null {
  const chaves = (mapa.get(id) ?? []).filter((k) => !MEDIDAS_DE_GORDURA.includes(k));
  let melhor: StagnantMeasure | null = null;
  for (const k of chaves) {
    const d = measureDeltaInWindow(history, k, weeks, now);
    if (!d) continue;
    if (!melhor || Math.abs(d.delta) > Math.abs(melhor.delta)) melhor = d;
  }
  return melhor;
}

/** Progressão do grupo: a melhor variação entre os exercícios que o citam. */
function performanceDoGrupo(
  id: MuscleGroupId,
  progressions: ExerciseProgression[]
): { pct: number | null; exercicios: number } {
  const doGrupo = progressions.filter((p) =>
    p.muscleGroup ? resolveMuscleGroupIds(p.muscleGroup).includes(id) : false
  );
  if (!doGrupo.length) return { pct: null, exercicios: 0 };
  const pct = Math.max(...doGrupo.map((p) => p.deltaPercent));
  return { pct, exercicios: doGrupo.length };
}

/** Ganho de carga abaixo disto, na janela, é ruído de execução — mesmo piso de
 *  `computeProgression`, repetido aqui como constante nomeada e não como número
 *  solto no meio de um `if`. */
const PISO_DE_PROGRESSAO = 2.5;

export function computeMuscleResponse(
  volume: GroupVolume[],
  progressions: ExerciseProgression[],
  indiretasPorSemana: Map<MuscleGroupId, number>,
  history: BodyMeasurement[],
  weeks: number,
  now: Date = new Date()
): RespostaMuscular[] {
  const mapa = medidasPorMusculo();

  return volume.map((v) => {
    const { pct, exercicios } = performanceDoGrupo(v.id, progressions);
    const medida = medidaDoGrupo(v.id, mapa, history, weeks, now);
    const indiretas = indiretasPorSemana.get(v.id) ?? 0;

    const base: Omit<RespostaMuscular, "veredito" | "motivo"> = {
      id: v.id,
      label: v.label,
      volume: v,
      indiretas,
      performancePct: pct,
      exercicios,
      medida,
    };

    // Grupo novo no modelo, com outros grupos já estabelecidos: o silêncio é a
    // resposta certa. Mesma guarda do diagnóstico de volume — sem ela, trapézio
    // e glúteos apareceriam como "não responde" por serem recentes.
    if (shouldSuppressVolumeDiagnosis(v, volume)) {
      return {
        ...base,
        veredito: "sem_base" as const,
        motivo: "Poucos registros próprios deste grupo para o app afirmar alguma coisa.",
      };
    }

    if (v.status === "sem_registro") {
      return {
        ...base,
        veredito: "estimulo_insuficiente" as const,
        motivo: `Nenhuma série registrada nas últimas ${weeks} semanas.`,
      };
    }

    // Sem carga registrada não há como falar de resposta: o volume sozinho diz
    // que houve estímulo, não que ele produziu algo.
    if (pct == null) {
      return {
        ...base,
        veredito: "sem_base" as const,
        motivo: `${v.setsPerWeek} séries/semana registradas, mas sem carga anotada para comparar. Registre peso e repetições para o app medir progressão.`,
      };
    }

    const progrediu = pct >= PISO_DE_PROGRESSAO;
    const volumeBaixo = v.status === "insuficiente";
    const medidaCresceu = medida != null && !isNoise(medida.delta) && medida.delta > 0;
    const medidaParada = medida != null && isNoise(medida.delta);

    if (progrediu) {
      return {
        ...base,
        veredito: "positiva" as const,
        motivo: medidaCresceu
          ? `Carga +${pct}% e ${medida!.label.toLowerCase()} +${medida!.delta} cm em ${medida!.weeks} semanas, com ${v.setsPerWeek} séries/semana.`
          : `Carga +${pct}% com ${v.setsPerWeek} séries/semana.${
              medidaParada
                ? ` A ${medida!.label.toLowerCase()} não saiu do lugar no período — normal quando a força sobe antes da medida.`
                : ""
            }`,
      };
    }

    if (volumeBaixo) {
      return {
        ...base,
        veredito: "estimulo_insuficiente" as const,
        motivo: `${v.setsPerWeek} séries/semana, abaixo do piso de ${v.minTarget}, e a carga não subiu (${pct}%). Falta estímulo antes de faltar qualquer outra coisa.`,
      };
    }

    // Volume dentro da faixa e nada se mexeu: é aqui que costuma estar o platô.
    // O app diz onde parou; NÃO manda somar série, porque a causa pode estar em
    // alimentação, sono, adesão ou execução, e nenhuma delas se resolve com
    // mais volume.
    return {
      ...base,
      veredito: "revisar" as const,
      motivo: `Volume dentro da faixa (${v.setsPerWeek}/semana) e carga em ${pct}% no período.${
        medidaParada ? ` A ${medida!.label.toLowerCase()} também está parada.` : ""
      } Vale conferir alimentação, sono, adesão e execução antes de mexer no volume.`,
    };
  });
}

/** Ordem de leitura: o que pede ação primeiro, o que está silencioso por último. */
const PESO: Record<RespostaVeredito, number> = {
  estimulo_insuficiente: 0,
  revisar: 1,
  positiva: 2,
  sem_base: 3,
};

export function porPrioridade(a: RespostaMuscular, b: RespostaMuscular): number {
  return PESO[a.veredito] - PESO[b.veredito] || a.label.localeCompare(b.label);
}
