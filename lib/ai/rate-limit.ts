import type { SupabaseClient } from "@supabase/supabase-js";
import { mensagemDoTeto, verificarTetoGlobal, type VereditoDoTeto } from "./budget";

export type AiKind =
  | "chat"
  | "meal_photo"
  | "meal_text"
  | "exam"
  | "supplement"
  | "workout_suggestion"
  | "medication_schedule"
  | "body_composition"
  | "body_photo";

// Limites por usuário em janela deslizante de 1 hora.
// Persistidos em ai_usage para valer entre instâncias serverless.
const HOURLY_LIMITS: Record<AiKind, number> = {
  chat: 30,
  meal_photo: 10,
  meal_text: 10,
  exam: 10,
  supplement: 10,
  workout_suggestion: 10,
  medication_schedule: 10,
  body_composition: 10,
  // Comparação de fotos manda duas imagens por chamada: mais cara que qualquer
  // outra rota, e é análise mensal por natureza — 5/h é folgado pro uso real.
  body_photo: 5,
};

const JANELA_SEGUNDOS = 60 * 60;

export type RateLimitResult =
  | { allowed: true; usageId: string | null }
  | {
      allowed: false;
      limit: number;
      retryAfterMinutes: number;
      /** Presente quando quem barrou foi o teto global ou a chave de desligar, não a cota por usuário. */
      motivoGlobal?: Exclude<VereditoDoTeto, { permitido: true }>["motivo"];
    };

/** A RPC ainda não existe no banco (migration 20261015102000 não aplicada). */
function rpcAusente(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

function minutosAteLiberar(maisAntigo: string | null | undefined): number {
  const oldestMs = maisAntigo ? new Date(maisAntigo).getTime() : Date.now();
  return Math.max(1, Math.ceil((oldestMs + JANELA_SEGUNDOS * 1000 - Date.now()) / 60000));
}

/**
 * Consome uma unidade da cota de IA, ou recusa. Fail-closed: qualquer erro
 * nega o uso.
 *
 * Desde GLYX-24 a contagem e o registro são UMA operação no banco
 * (`consumir_cota_ia`, com trava por usuário e tipo). Antes eram duas:
 * requisições em paralelo passavam juntas pela contagem, e a policy `for all`
 * deixava o usuário apagar o próprio histórico e zerar o limite.
 */
export async function checkAndRecordAiUsage(
  supabase: SupabaseClient,
  userId: string,
  kind: AiKind
): Promise<RateLimitResult> {
  const limit = HOURLY_LIMITS[kind];

  // Teto global antes da cota individual: acima do orçamento, ninguém consome
  // cota nem chega ao provedor (Etapa 1, C7).
  const teto = await verificarTetoGlobal(supabase);
  if (!teto.permitido) {
    return { allowed: false, limit, retryAfterMinutes: 60, motivoGlobal: teto.motivo };
  }

  const { data, error } = await supabase.rpc("consumir_cota_ia", {
    p_kind: kind,
    p_limite: limit,
    p_janela_segundos: JANELA_SEGUNDOS,
  });

  if (rpcAusente(error)) return checkAndRecordLegado(supabase, userId, kind, limit);
  if (error) return { allowed: false, limit, retryAfterMinutes: 5 };

  const linha = (Array.isArray(data) ? data[0] : data) as
    | { permitido: boolean; usage_id: string | null; mais_antigo: string | null }
    | null
    | undefined;
  if (!linha) return { allowed: false, limit, retryAfterMinutes: 5 };
  if (!linha.permitido) {
    return { allowed: false, limit, retryAfterMinutes: minutosAteLiberar(linha.mais_antigo) };
  }
  return { allowed: true, usageId: linha.usage_id ?? null };
}

/**
 * Caminho anterior (contar e inserir), usado SÓ enquanto a migration da RPC não
 * estiver aplicada. Depois dela, a policy de `ai_usage` não deixa mais o
 * usuário inserir direto, e este caminho falha fechado.
 */
async function checkAndRecordLegado(
  supabase: SupabaseClient,
  userId: string,
  kind: AiKind,
  limit: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - JANELA_SEGUNDOS * 1000).toISOString();

  const { count, error } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", windowStart);
  if (error) return { allowed: false, limit, retryAfterMinutes: 5 };

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
    return { allowed: false, limit, retryAfterMinutes: minutosAteLiberar(oldest?.created_at) };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("ai_usage")
    .insert({ user_id: userId, kind })
    .select("id")
    .maybeSingle();
  if (insertError) return { allowed: false, limit, retryAfterMinutes: 5 };
  return { allowed: true, usageId: inserted?.id ?? null };
}

// Grava a contagem de tokens reportada pelo provedor após a chamada concluir.
// Pela RPC, que só toca linha própria ainda sem tokens; sem a RPC, pelo update
// antigo. Falha aqui não derruba a resposta ao usuário — é contabilidade.
export async function recordAiTokens(
  supabase: SupabaseClient,
  usageId: string | null,
  usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
  model: string
): Promise<void> {
  if (!usageId || !usage) return;
  const { error } = await supabase.rpc("registrar_tokens_ia", {
    p_usage_id: usageId,
    p_prompt: usage.prompt_tokens ?? null,
    p_completion: usage.completion_tokens ?? null,
    p_model: model,
  });
  if (!rpcAusente(error)) return;
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
  if (r.motivoGlobal) return mensagemDoTeto(r.motivoGlobal);
  return `Limite de ${r.limit} usos de IA por hora atingido. Tente novamente em ~${r.retryAfterMinutes} min.`;
}
