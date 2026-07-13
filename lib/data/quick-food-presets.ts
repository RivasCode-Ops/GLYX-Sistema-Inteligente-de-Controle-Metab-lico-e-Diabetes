export type QuickFoodPreset = {
  id: string;
  name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
};

/**
 * Itens comuns fora do fluxo de foto — valores aproximados (fonte: tabelas
 * nutricionais padrão, TACO/USDA), pensados pra registro em 1 toque, não
 * precisão clínica. Água fica de fora de propósito: já tem card próprio
 * (components/dashboard/water-card.tsx) ligado a water_logs, não a meals.
 */
export const QUICK_FOOD_PRESETS: QuickFoodPreset[] = [
  { id: "maca", name: "Maçã", calories: 95, carbs_g: 25, protein_g: 0.5, fat_g: 0.3 },
  { id: "banana", name: "Banana", calories: 105, carbs_g: 27, protein_g: 1.3, fat_g: 0.4 },
  { id: "pao_frances", name: "Pão francês", calories: 150, carbs_g: 29, protein_g: 5, fat_g: 1.5 },
  { id: "cafe", name: "Café (sem açúcar)", calories: 2, carbs_g: 0, protein_g: 0.3, fat_g: 0 },
  { id: "suco_natural", name: "Suco natural (copo)", calories: 110, carbs_g: 26, protein_g: 1, fat_g: 0.2 },
  { id: "refrigerante", name: "Refrigerante (lata)", calories: 140, carbs_g: 39, protein_g: 0, fat_g: 0 },
  { id: "cerveja", name: "Cerveja (lata)", calories: 150, carbs_g: 13, protein_g: 1.6, fat_g: 0 },
  { id: "biscoito_agua_sal", name: "Biscoito água e sal (6un)", calories: 90, carbs_g: 15, protein_g: 2, fat_g: 3 },
];
