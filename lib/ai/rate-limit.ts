import type { SupabaseClient } from "@supabase/supabase-js";

export type AiKind =
  | "chat"
  | "meal_photo"
  | "meal_text"
  | "exam"
  | "supplement"
  | "workout_suggestion"
  | "medication_schedule";

// Limites por usuário em janela deslizante de 1 hora.
// Persistidos em ai_usage (RLS) para valer entre instâncias serverless.
const HOURLY_LIMITS: Record<AiKind, number> = {
  chat: 30,
  meal_photo: 10,
  meal_text: 10,
  exam: 10,
  supplement: 10,
  workout_suggestion: 10,
  medication_schedule: 10,
};

export type RateLimitResult =
  | { allowed: true; usageId: string | null }
  | { allowed: false; limit: number; retryAfterMinutes: number };

export async function checkAndRecordAiUsage(
  supabase: SupabaseClient,
  userId: string,
  kind: AiKind
): Promise<RateLimitResult> {
  const limit = HOURLY_LIMITS[kind];
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", windowStart);

  // Fail-closed: se a contagem falhar, não liberamos uso de IA (evita bypass).
  if (error) {
    return { allowed: false, limit, retryAfterMinutes: 5 };
  }

  if ((count ?? 0) >= limit) {
    const { data: oldest } = await supabase
      .from("ai_usage")
      .select("created_at")
      .eq("user_id", userId)
      .eq("kind", kind)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const oldestMs = oldest?.created_at ? new Date(oldest.created_at).getTime() : Date.now();
    const retryAfterMinutes = Math.max(1, Math.ceil((oldestMs + 60 * 60 * 1000 - Date.now()) / 60000));
    return { allowed: false, limit, retryAfterMinutes };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("ai_usage")
    .insert({ user_id: userId, kind })
    .select("id")
    .maybeSingle();
  if (insertError) {
    return { allowed: false, limit, retryAfterMinutes: 5 };
  }
  return { allowed: true, usageId: inserted?.id ?? null };
}

// Grava a contagem de tokens reportada pelo provedor após a chamada concluir.
export async function recordAiTokens(
  supabase: SupabaseClient,
  usageId: string | null,
  usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
  model: string
): Promise<void> {
  if (!usageId || !usage) return;
  await supabase
    .from("ai_usage")
    .update({
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      model,
    })
    .eq("id", usageId);
}

export function rateLimitMessage(r: Extract<RateLimitResult, { allowed: false }>): string {
  return `Limite de ${r.limit} usos de IA por hora atingido. Tente novamente em ~${r.retryAfterMinutes} min.`;
}
