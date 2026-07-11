// Converte a resposta textual do modelo (JSON, possivelmente cercado de ```json)
// no objeto de refeição; em falha de parse, preserva o texto bruto em notes.
export function parseMealJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as Record<string, unknown>;
  } catch {
    return { name: "análise pendente", notes: raw };
  }
}
