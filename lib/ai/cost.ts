/**
 * Estimativa de custo de IA — aproximada, baseada nos preços públicos do
 * Kimi K2.6 (US$/1M tokens). Usa a tarifa sem cache para uma estimativa
 * conservadora; a fatura real fica no painel Moonshot.
 */
const PRICE_PER_1M_INPUT_USD = 0.95;
const PRICE_PER_1M_OUTPUT_USD = 4;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const input = (inputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD;
  const output = (outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD;
  return Math.round((input + output) * 10000) / 10000;
}

export function formatUsd(value: number): string {
  if (value < 0.01) return `US$ ${value.toFixed(4)}`;
  return `US$ ${value.toFixed(2)}`;
}
