import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compara dois segredos em tempo constante.
 *
 * `===` sai no primeiro byte diferente, então o tempo de resposta vaza quanto
 * do segredo o atacante já acertou — com requisições suficientes dá para
 * reconstruir o valor byte a byte. O hash antes da comparação resolve o outro
 * problema do `timingSafeEqual` cru: ele **lança** quando os buffers têm
 * tamanhos diferentes, e o tamanho da entrada é controlado por quem chama.
 * SHA-256 iguala o tamanho sempre, sem revelar nada sobre o conteúdo.
 *
 * Usar em qualquer comparação de segredo vindo de fora (header de cron, código
 * de convite, token de webhook) — nunca `===`.
 */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided.trim()).digest();
  const b = createHash("sha256").update(expected.trim()).digest();
  return timingSafeEqual(a, b);
}
