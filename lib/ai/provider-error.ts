import { aiModel, aiProvider } from "@/lib/env";

// Converte falhas do provedor de IA em mensagens acionáveis para o usuário/admin,
// sem vazar detalhes sensíveis (chave, headers).
//
// As mensagens são derivadas do provedor ATIVO, não fixas. Antes citavam Kimi e
// KIMI_API_KEY em texto cru: depois da troca de provedor, um 401 da Anthropic
// mandaria conferir a chave errada — mensagem de erro que aponta para o lugar
// errado custa mais tempo que mensagem genérica.

const ENV_DA_CHAVE: Record<ReturnType<typeof aiProvider>, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  kimi: "KIMI_API_KEY",
  openai: "OPENAI_API_KEY",
};

const NOME_DO_PROVEDOR: Record<ReturnType<typeof aiProvider>, string> = {
  anthropic: "Anthropic",
  kimi: "Kimi (Moonshot)",
  openai: "OpenAI",
};

export function providerErrorMessage(e: unknown): string {
  const status =
    typeof e === "object" && e !== null && "status" in e ? Number((e as { status?: number }).status) : null;

  const provider = aiProvider();
  const nome = NOME_DO_PROVEDOR[provider];

  switch (status) {
    case 401:
      return `A API ${nome} recusou a chave (401). Verifique ${ENV_DA_CHAVE[provider]} e a base URL configurada.`;
    case 402:
      return "Provedor de IA sem créditos (402). Adicione saldo na conta do provedor.";
    case 404:
      return `Modelo não encontrado (404) em ${nome}. Verifique AI_MODEL (atual: ${aiModel()}).`;
    case 429:
      return "Provedor de IA com limite de requisições atingido (429). Tente novamente em instantes.";
    default: {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      return `Falha ao contactar o provedor de IA: ${msg}`;
    }
  }
}
