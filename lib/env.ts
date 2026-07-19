export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.length &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length
  );
}

export const KIMI_BASE_URL = "https://api.moonshot.ai/v1";
export const KIMI_MODEL = "kimi-k2.6";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o-mini";

export function aiApiKey(): string | undefined {
  return process.env.KIMI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || undefined;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(aiApiKey());
}

export function aiBaseUrl(): string {
  return (
    process.env.OPENAI_BASE_URL?.trim() ||
    (process.env.KIMI_API_KEY?.trim() ? KIMI_BASE_URL : OPENAI_BASE_URL)
  );
}

// Kimi é o padrão quando KIMI_API_KEY existe. Instalações ainda não migradas
// continuam na OpenAI até receberem a nova chave no ambiente de produção.
export function aiModel(): string {
  return (
    process.env.AI_MODEL?.trim() ||
    (process.env.KIMI_API_KEY?.trim() ? KIMI_MODEL : OPENAI_MODEL)
  );
}
