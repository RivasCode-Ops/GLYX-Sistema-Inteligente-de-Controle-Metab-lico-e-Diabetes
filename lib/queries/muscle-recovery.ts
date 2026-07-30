import { createClient } from "@/lib/supabase/server";
import { isMuscleGroupId, resolveMuscleGroupIds, type MuscleGroupId } from "@/lib/data/muscle-groups";

/** Data/hora do treino mais recente de cada grupo muscular do usuário logado. */
export async function getLastTrainedByMuscleGroup(): Promise<Partial<Record<MuscleGroupId, string>>> {
  const supabase = await createClient();
  if (!supabase) return {};

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from("exercise_sessions")
    .select("muscle_groups, started_at")
    .eq("user_id", user.id)
    .not("muscle_groups", "is", null)
    .order("started_at", { ascending: false })
    .limit(200);

  const result: Partial<Record<MuscleGroupId, string>> = {};
  for (const row of (data ?? []) as { muscle_groups: string[] | null; started_at: string }[]) {
    for (const g of row.muscle_groups ?? []) {
      // resolveMuscleGroupIds expande "pernas" legado em quadríceps + posterior.
      for (const id of resolveMuscleGroupIds(g)) {
        if (!result[id]) result[id] = row.started_at;
      }
    }
  }
  return result;
}

/**
 * Quantas sessões registraram cada grupo **em nome próprio**, sem janela de tempo.
 *
 * Alimenta `MIN_LOGS_FOR_ESTABLISHED_HISTORY`: é o que separa "nunca treinou este
 * grupo" de "este grupo acabou de existir no modelo". Sem janela de propósito — a
 * pergunta é se o grupo já foi registrado como ele mesmo alguma vez, não se foi
 * registrado recentemente.
 *
 * Lê `exercise_sessions`, a **mesma fonte** de `getLastTrainedByMuscleGroup`, e
 * isso não é detalhe: a guarda tem que olhar para onde o sinal que ela protege
 * nasce. A primeira versão contava `strength_logs` e ficava inerte — hoje não há
 * um único `strength_log` com `muscle_group`, enquanto as sessões cobrem onze
 * grupos. Guarda que lê a tabela errada não avisa nada e ainda parece instalada.
 */
export async function getSessionCountByMuscleGroup(): Promise<
  Partial<Record<MuscleGroupId, number>>
> {
  const supabase = await createClient();
  if (!supabase) return {};

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from("exercise_sessions")
    .select("muscle_groups")
    .eq("user_id", user.id)
    .not("muscle_groups", "is", null);

  const result: Partial<Record<MuscleGroupId, number>> = {};
  for (const row of (data ?? []) as { muscle_groups: string[] | null }[]) {
    for (const g of row.muscle_groups ?? []) {
      // Mesma expansão do legado "pernas" que o cálculo de última sessão usa.
      for (const id of resolveMuscleGroupIds(g)) {
        result[id] = (result[id] ?? 0) + 1;
      }
    }
  }
  return result;
}

/** Grupos com pausa manual ativa (id -> motivo, ou null se não informado). */
export async function getActiveMusclePauses(): Promise<Partial<Record<MuscleGroupId, string | null>>> {
  const supabase = await createClient();
  if (!supabase) return {};

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from("muscle_pauses")
    .select("muscle_group, reason")
    .eq("user_id", user.id)
    .is("resumed_at", null);

  const result: Partial<Record<MuscleGroupId, string | null>> = {};
  for (const row of (data ?? []) as { muscle_group: string; reason: string | null }[]) {
    if (isMuscleGroupId(row.muscle_group)) result[row.muscle_group] = row.reason;
  }
  return result;
}
