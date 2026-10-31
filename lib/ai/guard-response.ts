import { NextResponse } from "next/server";
import { AVISO_RESPOSTA_BARRADA, linguagemProibidaEm } from "@/lib/safety/ai-output-guard";

/**
 * Passa a resposta de uma rota de IA pela guarda de saída (Etapa 1, A6).
 *
 * Devolve a resposta HTTP de recusa quando algum texto da resposta tem
 * linguagem proibida, ou `null` quando ela pode seguir. Uso:
 *
 *     const barrada = respostaBarradaOuNull("ai/body-composition", parsed.data);
 *     if (barrada) return barrada;
 *
 * Chamar ANTES de gravar qualquer coisa: texto barrado não vai para o banco.
 */
export function respostaBarradaOuNull(rota: string, resposta: unknown): NextResponse | null {
  const hits = linguagemProibidaEm(resposta);
  if (!hits.length) return null;
  console.warn(`[${rota}] resposta barrada por linguagem proibida:`, hits.map((h) => h.phrase));
  return NextResponse.json({ error: AVISO_RESPOSTA_BARRADA, barrada: true }, { status: 422 });
}
