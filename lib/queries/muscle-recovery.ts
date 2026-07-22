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
