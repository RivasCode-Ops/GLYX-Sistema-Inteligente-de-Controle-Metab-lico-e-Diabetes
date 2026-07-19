export type GlycemicTier = "baixo" | "medio" | "alto";

/** Classifica a carga glicêmica estimada (0-100) de uma refeição/item. */
export function glycemicTier(score: number): GlycemicTier {
  if (score >= 67) return "alto";
  if (score >= 34) return "medio";
  return "baixo";
}

export const GLYCEMIC_TIER_LABEL: Record<GlycemicTier, string> = {
  baixo: "Impacto baixo",
  medio: "Impacto médio",
  alto: "Impacto alto",
};
