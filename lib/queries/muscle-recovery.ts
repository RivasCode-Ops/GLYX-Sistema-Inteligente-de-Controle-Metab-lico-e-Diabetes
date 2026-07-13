import { createClient } from "@/lib/supabase/server";
import { isMuscleGroupId, type MuscleGroupId } from "@/lib/data/muscle-groups";

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
      if (isMuscleGroupId(g) && !result[g]) result[g] = row.started_at;
    }
  }
  return result;
}
