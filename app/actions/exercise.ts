"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MUSCLE_GROUP_IDS } from "@/lib/data/muscle-groups";
import { ACTIVITY_TYPE_IDS } from "@/lib/data/activity-types";
import { wallClockToUTC } from "@/lib/time/local-day";
import { LOAD_PATTERN } from "@/lib/exercicios/training-plan";

const schema = z.object({
  label: z.string().min(1),
  activity_type: z.enum(ACTIVITY_TYPE_IDS as [string, ...string[]]).optional(),
  duration_min: z.coerce.number().optional(),
  calories_burned: z.coerce.number().optional(),
  intensity: z.string().optional(),
  notes: z.string().optional(),
  // Mesmo motivo do eaten_at_local em app/actions/meals.ts: sem isso,
  // started_at sempre virava "agora" (default da coluna), mesmo quando o
  // usuário registra bem depois de ter treinado.
  started_at_local: z.string().optional(),
});

/** "2026-07-18T13:04" (sem fuso) → ISO UTC. */
function localDateTimeToUTC(local: string, timezone: string | null | undefined): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return wallClockToUTC(Number(y), Number(mo), Number(d), Number(h), Number(mi), 0, timezone).toISOString();
}

export type ActionResult = { ok?: true; error?: string };

const muscleGroupsSchema = z.array(z.enum(MUSCLE_GROUP_IDS as [string, ...string[]])).min(1);
const trainingTypeSchema = z.enum(["forca", "resistencia"]).optional();

const TRAINING_TYPE_LABEL: Record<"forca" | "resistencia", string> = {
  forca: "Treino de força",
  resistencia: "Treino de resistência",
};

/** Registro rápido do painel de recuperação: "malhei hoje" com os grupos marcados. */
export async function logMuscleTraining(
  muscleGroups: string[],
  trainingType?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsedGroups = muscleGroupsSchema.safeParse(muscleGroups);
  if (!parsedGroups.success) return { error: "Selecione pelo menos um grupo muscular." };
  const parsedType = trainingTypeSchema.safeParse(trainingType);
  const type = parsedType.success ? parsedType.data : undefined;

  // ---------------------------------------------------------------------------
  // Duração herdada do plano — e MARCADA como herdada
  // ---------------------------------------------------------------------------
  // Este caminho (marcar grupos em Recuperação) nunca perguntou minutos, e a
  // meta semanal é em minutos: 18 das 21 sessões ficaram sem duração, e a tela
  // dizia "faltam 160 min" em semana treinada. Meta inatingível por construção
  // deixa de ser lida.
  //
  // Herdar o previsto do plano resolve a meta sem inventar precisão — desde que
  // o banco saiba que o número foi ESTIMADO. Sem `duration_source`, o total
  // semanal misturaria cronômetro com presunção e ninguém depois separaria.
  const { error } = await supabase.from("exercise_sessions").insert({
    user_id: user.id,
    label: type ? TRAINING_TYPE_LABEL[type] : "Treino",
    intensity: type ?? null,
    muscle_groups: parsedGroups.data,
    duration_min: LOAD_PATTERN.sessionMinutes,
    duration_source: "estimado",
  });

  if (error) return { error: error.message };

  // Treinar um grupo que estava pausado é o próprio usuário dizendo que já
  // consegue seguir o plano nele de novo — retoma automaticamente.
  await supabase
    .from("muscle_pauses")
    .update({ resumed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("muscle_group", parsedGroups.data)
    .is("resumed_at", null);

  revalidatePath("/exercicios");
  revalidatePath("/exercicios/recuperacao");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Pausa manual de um grupo ("não consigo seguir o plano nele agora") — sem prazo fixo, até o usuário liberar. */
export async function pauseMuscleGroup(muscleGroup: string, reason?: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = z.enum(MUSCLE_GROUP_IDS as [string, ...string[]]).safeParse(muscleGroup);
  if (!parsed.success) return { error: "Grupo muscular inválido." };

  const { error } = await supabase.from("muscle_pauses").insert({
    user_id: user.id,
    muscle_group: parsed.data,
    reason: reason?.trim() || null,
  });

  if (error) {
    if (error.code === "23505") return { error: "Esse grupo já está pausado." };
    return { error: error.message };
  }

  revalidatePath("/exercicios/recuperacao");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Libera um grupo pausado, voltando ao cronômetro normal de recuperação. */
export async function resumeMuscleGroup(muscleGroup: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("muscle_pauses")
    .update({ resumed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("muscle_group", muscleGroup)
    .is("resumed_at", null);

  if (error) return { error: error.message };

  revalidatePath("/exercicios/recuperacao");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function addExerciseSession(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse({
    label: formData.get("label"),
    activity_type: formData.get("activity_type") || undefined,
    duration_min: formData.get("duration_min") || undefined,
    calories_burned: formData.get("calories_burned") || undefined,
    intensity: formData.get("intensity") || undefined,
    notes: formData.get("notes") || undefined,
    started_at_local: formData.get("started_at_local") || undefined,
  });
  if (!parsed.success) return { error: "Descreva a atividade." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const { started_at_local, ...rest } = parsed.data;
  const startedAt = started_at_local
    ? localDateTimeToUTC(started_at_local, profile?.timezone)
    : undefined;

  // Aqui os minutos vêm do formulário — quando vierem, são medidos, e a origem
  // registra isso. Sem eles, a sessão fica sem duração em vez de herdar: neste
  // caminho o campo EXISTE e ficou vazio, o que é diferente de um caminho que
  // nunca pergunta.
  const { error } = await supabase.from("exercise_sessions").insert({
    user_id: user.id,
    ...rest,
    ...(startedAt ? { started_at: startedAt } : {}),
    ...(rest.duration_min != null ? { duration_source: "informado" as const } : {}),
  });

  if (error) return { error: error.message };

  revalidatePath("/exercicios");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteExerciseSession(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Registro inválido." };

  const supabase = await createClient();
  if (!supabase) return { error: "Configure o Supabase (.env.local)." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("exercise_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/exercicios");
  revalidatePath("/exercicios/sessoes");
  revalidatePath("/dashboard");
  return { ok: true };
}
