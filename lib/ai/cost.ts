/**
 * Estimativa de custo de IA por provedor (US$ por 1 milhão de tokens, tarifa
 * sem cache — estimativa conservadora; a fatura real fica no painel de cada
 * provedor).
 *
 * Antes havia só a tarifa da Kimi, aplicada a qualquer modelo: com
 * `AI_PROVIDER=anthropic` o medidor do admin mostrava metade do gasto real.
 * Esta tabela é também a que o teto global (`lib/ai/budget.ts`) manda ao banco:
 * um preço, um lugar.
 *
 * Fontes: Kimi K2.6 — preço público Moonshot (tabela anterior deste arquivo);
 * Claude Sonnet 5 — tabela oficial da Anthropic (out/2026: US$ 2 / US$ 10);
 * gpt-4o-mini — preço público OpenAI conhecido (US$ 0,15 / US$ 0,60), CONFERIR
 * se um dia a OpenAI voltar a ser usada.
 */
export type ProvedorDePreco = "kimi" | "anthropic" | "openai";

export const PRECOS_POR_MILHAO_USD: Record<ProvedorDePreco, { entrada: number; saida: number }> = {
  kimi: { entrada: 0.95, saida: 4 },
  anthropic: { entrada: 2, saida: 10 },
  openai: { entrada: 0.15, saida: 0.6 },
};

/**
 * Provedor a partir do nome do modelo gravado em `ai_usage.model`. Desconhecido
 * cai na Kimi (o padrão do app). A mesma regra existe no banco
 * (`ia_dentro_do_teto`), que recebe esta tabela por parâmetro.
 */
export function provedorDoModelo(modelo: string | null | undefined): ProvedorDePreco {
  const m = (modelo ?? "").toLowerCase();
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "openai";
  return "kimi";
}

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  modelo?: string | null
): number {
  const preco = PRECOS_POR_MILHAO_USD[provedorDoModelo(modelo)];
  const input = (inputTokens / 1_000_000) * preco.entrada;
  const output = (outputTokens / 1_000_000) * preco.saida;
  return Math.round((input + output) * 10000) / 10000;
}

export function formatUsd(value: number): string {
  if (value < 0.01) return `US$ ${value.toFixed(4)}`;
  return `US$ ${value.toFixed(2)}`;
}

/**
 * Tokens estimados quando o provedor não manda `usage` (resposta barrada pela
 * guarda ou conexão caída: o `usage` vem só no último pedaço). ~4 caracteres
 * por token em português, arredondado PARA CIMA: o teto global prefere
 * superestimar a deixar custo invisível.
 */
export function estimarUsoDeTokens(
  textoEnviado: string,
  caracteresRecebidos: number
): { prompt_tokens: number; completion_tokens: number } {
  return {
    prompt_tokens: Math.ceil(textoEnviado.length / 4),
    completion_tokens: Math.ceil(caracteresRecebidos / 4),
  };
}
