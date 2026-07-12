/**
 * Estimativa de custo de IA — aproximada, baseada nos preços públicos do
 * gpt-4o-mini (US$/1M tokens). Serve para acompanhamento, não é fatura
 * exata: o OpenRouter pode aplicar preço/margem diferente conforme o
 * modelo configurado em AI_MODEL.
 */
const PRICE_PER_1M_INPUT_USD = 0.15;
const PRICE_PER_1M_OUTPUT_USD = 0.6;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const input = (inputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD;
  const output = (outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD;
  return Math.round((input + output) * 10000) / 10000;
}

export function formatUsd(value: number): string {
  if (value < 0.01) return `US$ ${value.toFixed(4)}`;
  return `US$ ${value.toFixed(2)}`;
}
