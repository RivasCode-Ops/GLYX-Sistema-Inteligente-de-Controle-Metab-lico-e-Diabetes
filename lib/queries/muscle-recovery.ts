import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isMuscleGroupId, type MuscleGroupId } from "@/lib/data/muscle-groups";
import {
  countOwnRegistrations,
  mergeLastTrained,
  type MuscleEvent,
} from "@/lib/exercicios/muscle-history";

/** Sessões do usuário — "malhei peito hoje", com os grupos escolhidos à mão. */
async function sessionEvents(supabase: SupabaseClient, userId: string): Promise<MuscleEvent[]> {
  const { data } = await supabase
    .from("exercise_sessions")
    .select("muscle_groups, started_at")
    .eq("user_id", userId)
    .not("muscle_groups", "is", null)
    .order("started_at", { ascending: false })
    .limit(200);

  return ((data ?? []) as { muscle_groups: string[] | null; started_at: string }[]).map((row) => ({
    groups: row.muscle_groups ?? [],
    at: row.started_at,
  }));
}

/**
 * Registros de carga com músculo — na prática, os que vieram do catálogo.
 *
 * `muscle_group` só é preenchido quando o exercício foi escolhido da lista, e é
 * o servidor que o deriva. Registro por texto livre entra nulo e é filtrado
 * aqui: sem saber o músculo, ele não pode dizer que um grupo foi treinado.
 */
async function strengthEvents(supabase: SupabaseClient, userId: string): Promise<MuscleEvent[]> {
  const { data } = await supabase
    .from("strength_logs")
    .select("muscle_group, logged_at")
    .eq("user_id", userId)
    .not("muscle_group", "is", null)
    .order("logged_at", { ascending: false })
    .limit(500);

  return ((data ?? []) as { muscle_group: string | null; logged_at: string }[]).map((row) => ({
    groups: row.muscle_group ? [row.muscle_group] : [],
    at: row.logged_at,
  }));
}

/**
 * Data/hora do treino mais recente de cada grupo muscular do usuário logado.
 *
 * Lê as duas fontes. Quem registra série por série sem abrir sessão treinou do
 * mesmo jeito, e antes da ponte com o catálogo aparecia como quem não treinou —
 * o cronômetro de recuperação ficava correndo para um grupo que acabara de ser
 * trabalhado.
 */
export async function getLastTrainedByMuscleGroup(): Promise<Partial<Record<MuscleGroupId, string>>> {
  const supabase = await createClient();
  if (!supabase) return {};

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const [sessions, sets] = await Promise.all([
    sessionEvents(supabase, user.id),
    strengthEvents(supabase, user.id),
  ]);

  return mergeLastTrained(sessions, sets);
}

/**
 * Quantas vezes cada grupo foi registrado **em nome próprio**, sem janela de tempo.
 *
 * Alimenta `MIN_LOGS_FOR_ESTABLISHED_HISTORY`: é o que separa "nunca treinou este
 * grupo" de "este grupo acabou de existir no modelo". Sem janela de propósito — a
 * pergunta é se o grupo já foi registrado como ele mesmo alguma vez, não se foi
 * registrado recentemente.
 *
 * Lê **exatamente as mesmas fontes** de `getLastTrainedByMuscleGroup`, e isso é a
 * regra inteira desta função: a guarda tem que olhar para onde nasce o sinal que
 * ela protege. A primeira versão contava só `strength_logs` e ficava inerte,
 * porque nenhum registro de carga tinha `muscle_group` — guarda que lê a tabela
 * errada não avisa nada e ainda parece instalada. Passar a somar carga sem somá-la
 * também no sinal recriaria o mesmo defeito pelo outro lado.
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

  const [sessions, sets] = await Promise.all([
    sessionEvents(supabase, user.id),
    strengthEvents(supabase, user.id),
  ]);

  return countOwnRegistrations(sessions, sets);
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
