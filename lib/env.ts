export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.length &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length
  );
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.length);
}

// Modelo configurável para permitir provedores OpenAI-compatible (OpenRouter, etc.)
// via OPENAI_BASE_URL + AI_MODEL; o SDK lê OPENAI_BASE_URL automaticamente.
export function aiModel(): string {
  return process.env.AI_MODEL?.length ? process.env.AI_MODEL : "gpt-4o-mini";
}
