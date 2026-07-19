export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.length &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length
  );
}

export const KIMI_BASE_URL = "https://api.moonshot.ai/v1";
export const KIMI_MODEL = "kimi-k2.6";

export function aiApiKey(): string | undefined {
  return process.env.KIMI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || undefined;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(aiApiKey());
}

export function aiBaseUrl(): string {
  return process.env.OPENAI_BASE_URL?.trim() || KIMI_BASE_URL;
}

// Kimi é o provedor padrão; OPENAI_BASE_URL/AI_MODEL preservam compatibilidade
// com instalações existentes que usem outro provedor OpenAI-compatible.
export function aiModel(): string {
  return process.env.AI_MODEL?.trim() || KIMI_MODEL;
}
