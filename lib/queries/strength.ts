import { createClient } from "@/lib/supabase/server";

export type StrengthLog = {
  id: string;
  exercise_name: string;
  muscle_group: string | null;
  weight_kg: number | null;
  reps: number;
  sets: number;
  logged_at: string;
};

/** Últimos registros de carga do usuário logado — usado tanto pra mostrar o
 * histórico quanto pra achar "última vez" de um exercício no formulário. */
export async function getRecentStrengthLogs(limit = 50): Promise<StrengthLog[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("strength_logs")
    .select("id, exercise_name, muscle_group, weight_kg, reps, sets, logged_at")
    .eq("user_id", user.id)
    .order("logged_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as StrengthLog[];
}
