// Converte falhas do provedor de IA em mensagens acionáveis para o usuário/admin,
// sem vazar detalhes sensíveis (chave, headers).
export function providerErrorMessage(e: unknown): string {
  const status =
    typeof e === "object" && e !== null && "status" in e ? Number((e as { status?: number }).status) : null;

  switch (status) {
    case 401:
      return "Provedor de IA recusou a chave (401). Verifique OPENAI_API_KEY e, se usar OpenRouter, defina também OPENAI_BASE_URL=https://openrouter.ai/api/v1.";
    case 402:
      return "Provedor de IA sem créditos (402). Adicione saldo na conta do provedor.";
    case 404:
      return "Modelo não encontrado (404). Verifique AI_MODEL (ex.: openai/gpt-4o-mini no OpenRouter).";
    case 429:
      return "Provedor de IA com limite de requisições atingido (429). Tente novamente em instantes.";
    default: {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      return `Falha ao contactar o provedor de IA: ${msg}`;
    }
  }
}
