export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.length &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length
  );
}

// ---------------------------------------------------------------------------
// Provedor de IA
// ---------------------------------------------------------------------------
// A seleção é EXPLÍCITA (`AI_PROVIDER`), com fallback por presença de chave.
// Antes era só por presença de chave, o que tornava impossível ter duas chaves
// no ambiente e escolher qual usar — e a escolha mudava sozinha no dia em que
// alguém adicionasse uma chave para testar.
//
// Todas as rotas seguem falando com a camada de compatibilidade OpenAI
// (`createAiClient()` + `aiModel()`), então a troca não toca nenhuma delas.

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1/";
export const ANTHROPIC_MODEL = "claude-sonnet-5";

export const KIMI_BASE_URL = "https://api.moonshot.ai/v1";
export const KIMI_MODEL = "kimi-k2.6";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o-mini";

export type AiProvider = "anthropic" | "kimi" | "openai";

export function aiProvider(): AiProvider {
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === "anthropic" || forced === "kimi" || forced === "openai") {
    return forced;
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "anthropic";
  if (process.env.KIMI_API_KEY?.trim()) return "kimi";
  return "openai";
}

export function aiApiKey(): string | undefined {
  switch (aiProvider()) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
    case "kimi":
      return process.env.KIMI_API_KEY?.trim() || undefined;
    case "openai":
      return process.env.OPENAI_API_KEY?.trim() || undefined;
  }
}

export function isOpenAIConfigured(): boolean {
  return Boolean(aiApiKey());
}

/** Nome da variável de ambiente que o provedor ativo espera. Usado em mensagem de erro. */
export function aiKeyEnvName(): string {
  switch (aiProvider()) {
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "kimi":
      return "KIMI_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
  }
}

export function aiBaseUrl(): string {
  // `OPENAI_BASE_URL` é o nome antigo e continua valendo: é o que está definido
  // hoje na Vercel apontando para a Moonshot, e também é como um proxy tipo
  // OpenRouter é configurado. Ignorá-lo em silêncio mandaria as instalações
  // existentes para o provedor errado sem nenhum erro.
  const override = process.env.AI_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim();
  if (override) return override;

  switch (aiProvider()) {
    case "anthropic":
      return ANTHROPIC_BASE_URL;
    case "kimi":
      return KIMI_BASE_URL;
    case "openai":
      return OPENAI_BASE_URL;
  }
}

// `AI_MODEL` continua sendo o override por ambiente. Para as rotas de
// classificação simples (`status`, `medication-schedule`) vale apontar um
// modelo mais barato — em Anthropic, `claude-haiku-4-5`.
export function aiModel(): string {
  const override = process.env.AI_MODEL?.trim();
  if (override) return override;

  switch (aiProvider()) {
    case "anthropic":
      return ANTHROPIC_MODEL;
    case "kimi":
      return KIMI_MODEL;
    case "openai":
      return OPENAI_MODEL;
  }
}
