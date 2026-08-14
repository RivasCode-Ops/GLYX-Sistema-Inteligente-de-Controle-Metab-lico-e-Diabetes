import { resolveMuscleGroupIds, type MuscleGroupId } from "@/lib/data/muscle-groups";

/**
 * Histórico muscular vindo das DUAS fontes que registram treino: a sessão
 * ("malhei peito hoje") e o registro de carga ("supino, 4×10, 60 kg").
 *
 * Antes da ponte com o catálogo só a sessão contava, e não por escolha: nenhum
 * `strength_log` tinha `muscle_group`, então somar a segunda fonte somaria zero.
 * Com o exercício vindo do catálogo, o músculo passa a ser derivado, e ignorar
 * o registro de carga viraria erro de verdade — quem registra série por série e
 * não abre sessão apareceria como quem não treina.
 *
 * As funções são puras e vivem juntas de propósito: a regra que o módulo existe
 * para garantir é que o sinal (última vez que treinou) e a guarda que o silencia
 * (quantas vezes o grupo foi registrado) leiam **as mesmas fontes**. Guarda que
 * lê tabela diferente do sinal não protege nada e ainda parece instalada — foi
 * exatamente o que aconteceu quando a guarda contava `strength_logs` sozinha.
 */

export type MuscleEvent = {
  /** Grupos registrados. Texto cru: passa por `resolveMuscleGroupIds`, que
   * expande o legado "pernas" em quadríceps + posterior. */
  groups: string[];
  /** Instante do registro — `started_at` na sessão, `logged_at` na carga. */
  at: string;
};

/** Instante mais recente em que cada grupo foi treinado, por qualquer fonte. */
export function mergeLastTrained(
  ...sources: MuscleEvent[][]
): Partial<Record<MuscleGroupId, string>> {
  const result: Partial<Record<MuscleGroupId, string>> = {};

  for (const events of sources) {
    for (const event of events) {
      for (const group of event.groups) {
        for (const id of resolveMuscleGroupIds(group)) {
          const current = result[id];
          // Comparação por instante, não por ordem de chegada: as duas fontes
          // vêm ordenadas separadamente, e concatenar não produz ordem única.
          if (!current || new Date(event.at).getTime() > new Date(current).getTime()) {
            result[id] = event.at;
          }
        }
      }
    }
  }

  return result;
}

/** Data local (YYYY-MM-DD) de um instante ISO. */
function dayOf(at: string): string {
  return at.slice(0, 10);
}

/**
 * Ocasiões em que cada grupo foi registrado **em nome próprio**, sem janela de
 * tempo — a pergunta é se o grupo já existiu por conta própria alguma vez, não
 * se foi treinado recentemente.
 *
 * Sessão conta por linha; carga conta por **dia distinto**. A diferença não é
 * capricho: quatro séries de supino são quatro linhas em `strength_logs`, e
 * contá-las como quatro ocasiões faria um único treino satisfazer sozinho o
 * mínimo de histórico próprio — a guarda se desarmaria com o primeiro dia de
 * academia, que é o oposto do que ela existe para fazer.
 */
export function countOwnRegistrations(
  sessions: MuscleEvent[],
  strengthSets: MuscleEvent[]
): Partial<Record<MuscleGroupId, number>> {
  const result: Partial<Record<MuscleGroupId, number>> = {};

  for (const session of sessions) {
    for (const group of session.groups) {
      for (const id of resolveMuscleGroupIds(group)) {
        result[id] = (result[id] ?? 0) + 1;
      }
    }
  }

  const daysByGroup = new Map<MuscleGroupId, Set<string>>();
  for (const set of strengthSets) {
    for (const group of set.groups) {
      for (const id of resolveMuscleGroupIds(group)) {
        let days = daysByGroup.get(id);
        if (!days) {
          days = new Set<string>();
          daysByGroup.set(id, days);
        }
        days.add(dayOf(set.at));
      }
    }
  }

  for (const [id, days] of daysByGroup) {
    result[id] = (result[id] ?? 0) + days.size;
  }

  return result;
}
