// Converte falhas do provedor de IA em mensagens acionáveis para o usuário/admin,
// sem vazar detalhes sensíveis (chave, headers).
export function providerErrorMessage(e: unknown): string {
  const status =
    typeof e === "object" && e !== null && "status" in e ? Number((e as { status?: number }).status) : null;

  switch (status) {
    case 401:
      return "A API Kimi recusou a chave (401). Verifique KIMI_API_KEY e OPENAI_BASE_URL=https://api.moonshot.ai/v1.";
    case 402:
      return "Provedor de IA sem créditos (402). Adicione saldo na conta do provedor.";
    case 404:
      return "Modelo não encontrado (404). Verifique se AI_MODEL=kimi-k2.6.";
    case 429:
      return "Provedor de IA com limite de requisições atingido (429). Tente novamente em instantes.";
    default: {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      return `Falha ao contactar o provedor de IA: ${msg}`;
    }
  }
}
