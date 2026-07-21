// Converte a resposta textual do modelo (JSON, possivelmente cercado de ```json)
// no objeto de refeição; em falha de parse, preserva o texto bruto em notes.
export function parseMealJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as Record<string, unknown>;
  } catch {
    return { name: "análise pendente", notes: raw };
  }
}

/**
 * Resposta que não dá pra usar: vazia ou cortada no teto de `max_tokens`.
 *
 * Sem essa checagem o fluxo falha em silêncio — `parseMealJson` cai no
 * fallback, `sumMealItems` soma zero item e a rota devolve calorias/macros
 * zerados como se a estimativa tivesse dado certo. Foi o que aconteceu em
 * 20/07/2026, quando um build sem `thinking: disabled` gastou todos os tokens
 * em raciocínio e devolveu conteúdo vazio: a tela mostrou 0 em tudo, sem erro.
 */
export function isUnusableCompletion(
  content: string | null | undefined,
  finishReason?: string | null
): boolean {
  return !content?.trim() || finishReason === "length";
}

export type MealItem = {
  name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  /** Só preenchido pela análise por foto (um item pode ter carga glicêmica
   * bem diferente do resto do prato — ex.: o refrigerante sozinho). */
  glycemic_load_estimate?: number;
  implication?: string;
};

// Soma os itens detectados (um por alimento/bebida distinto na foto) nos
// totais da refeição — o modelo não é confiável pra fazer essa soma sozinho,
// então a aritmética fica no servidor.
export function sumMealItems(raw: Record<string, unknown>): {
  name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  items: MealItem[];
} {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: MealItem[] = rawItems.map((it) => {
    const r = (it ?? {}) as Record<string, unknown>;
    return {
      name: String(r.name ?? "item"),
      calories: Number(r.calories) || 0,
      carbs_g: Number(r.carbs_g) || 0,
      protein_g: Number(r.protein_g) || 0,
      fat_g: Number(r.fat_g) || 0,
      ...(typeof r.glycemic_load_estimate === "number"
        ? { glycemic_load_estimate: r.glycemic_load_estimate }
        : {}),
      ...(typeof r.implication === "string" && r.implication ? { implication: r.implication } : {}),
    };
  });

  const sum = (key: keyof MealItem) =>
    Math.round(items.reduce((acc, it) => acc + (typeof it[key] === "number" ? (it[key] as number) : 0), 0));

  return {
    name: items.map((it) => it.name).filter(Boolean).join(" + ") || String(raw.name ?? "análise pendente"),
    calories: sum("calories"),
    carbs_g: sum("carbs_g"),
    protein_g: sum("protein_g"),
    fat_g: sum("fat_g"),
    items,
  };
}
