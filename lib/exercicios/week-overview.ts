import type { ExerciseSession } from "@/types/database";
import type { BodyGoal } from "@/lib/health/energy";
import {
  computeWeeklyExerciseProgress,
  getWeeklyExerciseTarget,
  startOfWeek,
  type WeeklyExerciseGlucoseContext,
  type WeeklyExerciseProgress,
} from "@/lib/exercicios/weekly-goals";

/**
 * Resumo da semana de exercício — uma implementação, vários consumidores.
 *
 * A tela de Exercícios mostra a mesma grandeza em quatro lugares (os pontos da
 * semana, o anel de %, o "resumo rápido" e os ladrilhos de carga/meta). Cada um
 * contando por conta seria a repetição do defeito que este app já pagou em
 * adesão e no recibo de contexto.
 *
 * Minutos, sessões e % vêm INTEIROS de `computeWeeklyExerciseProgress` — aqui
 * não se recalcula nenhum deles, só se acrescenta o que ela não cobre: a
 * distribuição por dia da semana, a energia registrada, a comparação com a
 * semana anterior e o número de semanas seguidas na meta.
 */

const SIGLAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

export type DiaDaSemana = {
  sigla: string;
  /** YYYY-MM-DD local */
  dia: string;
  treinou: boolean;
  /** Dia que ainda não chegou — ponto vazio ali não é falha, é futuro. */
  futuro: boolean;
  hoje: boolean;
};

export type CargaDaSemana = {
  /** Faixa relativa à META DO USUÁRIO, não a uma tabela genérica. */
  faixa: "leve" | "moderada" | "alta";
  /**
   * Variação de minutos contra a semana anterior. `null` quando a semana
   * anterior não teve minuto nenhum: dividir por zero produziria "+∞%", e
   * "aumentou 100%" saindo de zero é número sem significado.
   */
  deltaPct: number | null;
};

export type ResumoSemanaExercicio = {
  progresso: WeeklyExerciseProgress;
  dias: DiaDaSemana[];
  /** Dias com ao menos uma sessão — o "3" de "3/5 treinos". */
  diasTreinados: number;
  metaSessoes: number;
  /**
   * Energia somada dos registros que TRAZEM o número. `null` quando nenhum
   * traz: o app não estima caloria de treino, porque a estimativa depende de
   * peso, intensidade e frequência cardíaca que ele não tem.
   */
  kcal: number | null;
  /** De quantas sessões da semana o `kcal` saiu — o card diz isso em voz alta. */
  kcalDeSessoes: number;
  carga: CargaDaSemana;
  /**
   * Semanas seguidas (contando de trás para frente, sem incluir a atual, que
   * ainda não acabou) em que o número de sessões bateu a meta.
   */
  semanasSeguidasNaMeta: number;
};

function chaveDoDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function minutosNaSemana(sessions: ExerciseSession[], inicio: Date): number {
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  return sessions.reduce((soma, s) => {
    const t = new Date(s.started_at);
    return t >= inicio && t < fim ? soma + (s.duration_min ?? 0) : soma;
  }, 0);
}

function sessoesNaSemana(sessions: ExerciseSession[], inicio: Date): number {
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  return sessions.filter((s) => {
    const t = new Date(s.started_at);
    return t >= inicio && t < fim;
  }).length;
}

export function resumirSemanaDeExercicio(
  /** Sessões de várias semanas — a atual e as anteriores saem daqui. */
  sessions: ExerciseSession[],
  goal: BodyGoal | null = null,
  now: Date = new Date(),
  glucose?: WeeklyExerciseGlucoseContext
): ResumoSemanaExercicio {
  const progresso = computeWeeklyExerciseProgress(sessions, now, goal, glucose);
  const meta = getWeeklyExerciseTarget(goal);

  const inicio = startOfWeek(now);
  const hoje = chaveDoDia(now);

  const comSessao = new Set<string>();
  let kcal = 0;
  let kcalDeSessoes = 0;

  const fimDaSemana = new Date(inicio);
  fimDaSemana.setDate(fimDaSemana.getDate() + 7);
  for (const s of sessions) {
    const t = new Date(s.started_at);
    if (t < inicio || t >= fimDaSemana) continue;
    comSessao.add(chaveDoDia(t));
    if (s.calories_burned != null) {
      kcal += s.calories_burned;
      kcalDeSessoes += 1;
    }
  }

  const dias: DiaDaSemana[] = SIGLAS.map((sigla, i) => {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    const chave = chaveDoDia(d);
    return {
      sigla,
      dia: chave,
      treinou: comSessao.has(chave),
      futuro: chave > hoje,
      hoje: chave === hoje,
    };
  });

  // Carga: relativa à meta do próprio usuário. Uma tabela genérica de "150 min
  // = moderado" diria a mesma coisa para quem mira 120 e para quem mira 180.
  const faixa: CargaDaSemana["faixa"] =
    progresso.progressPct >= 100 ? "alta" : progresso.progressPct >= 60 ? "moderada" : "leve";

  const semanaAnterior = new Date(inicio);
  semanaAnterior.setDate(semanaAnterior.getDate() - 7);
  const minutosAnteriores = minutosNaSemana(sessions, semanaAnterior);
  const deltaPct =
    minutosAnteriores > 0
      ? Math.round(((progresso.minutes - minutosAnteriores) / minutosAnteriores) * 100)
      : null;

  // Semanas seguidas na meta: só semanas FECHADAS entram. A atual ainda pode
  // fechar, e contá-la como falha no meio da quarta-feira seria acusação.
  let semanasSeguidasNaMeta = 0;
  for (let k = 1; k <= 12; k++) {
    const ini = new Date(inicio);
    ini.setDate(ini.getDate() - 7 * k);
    if (sessoesNaSemana(sessions, ini) >= meta.targetSessions) semanasSeguidasNaMeta += 1;
    else break;
  }

  return {
    progresso,
    dias,
    diasTreinados: comSessao.size,
    metaSessoes: meta.targetSessions,
    kcal: kcalDeSessoes > 0 ? Math.round(kcal) : null,
    kcalDeSessoes,
    carga: { faixa, deltaPct },
    semanasSeguidasNaMeta,
  };
}
