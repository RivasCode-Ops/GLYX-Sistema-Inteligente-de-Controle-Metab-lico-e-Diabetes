/**
 * Parse tolerante do JSON devolvido pelo modelo.
 *
 * Motivo: `response_format: { type: "json_object" }` é uma garantia da OpenAI.
 * A camada de compatibilidade da Anthropic ACEITA o campo e o IGNORA — o modelo
 * volta a poder responder com o JSON embrulhado em cerca de markdown ou com uma
 * frase antes. Sem este parse, a troca de provedor transformaria todas as rotas
 * que leem JSON em 502 intermitente, e o sintoma ("formato inesperado do
 * modelo") não apontaria para a causa.
 *
 * Não é um parser de JSON malformado: só descasca embalagem. Se o conteúdo
 * dentro não for JSON válido, devolve null e quem chamou trata como falha — que
 * é o comportamento correto, porque a alternativa seria adivinhar campo clínico.
 */
export function parseModelJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;

  const semCerca = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const tentar = (s: string): T | null => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };

  const direto = tentar(semCerca);
  if (direto !== null) return direto;

  // Última tentativa: recortar do primeiro `{` ao último `}`. Cobre o caso de o
  // modelo escrever uma frase antes ou depois do objeto.
  const inicio = semCerca.indexOf("{");
  const fim = semCerca.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) return null;
  return tentar(semCerca.slice(inicio, fim + 1));
}
