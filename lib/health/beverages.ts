// Tipos de bebida do registro rápido. Água, água com gás e chá contam para a
// meta de hidratação; café e refrigerante diet são registrados (a IA os
// considera no contexto metabólico) mas não somam na meta de água.

export const BEVERAGE_KINDS = [
  "agua",
  "agua_com_gas",
  "cha",
  "cafe",
  "refrigerante_diet",
  "outra",
] as const;

export type BeverageKind = (typeof BEVERAGE_KINDS)[number];

export const HYDRATING_KINDS: readonly BeverageKind[] = ["agua", "agua_com_gas", "cha"];

export const BEVERAGE_META: Record<
  BeverageKind,
  { label: string; emoji: string; defaultMl: number }
> = {
  agua: { label: "Água", emoji: "💧", defaultMl: 250 },
  agua_com_gas: { label: "Água c/ gás", emoji: "🫧", defaultMl: 250 },
  cha: { label: "Chá", emoji: "🍵", defaultMl: 200 },
  cafe: { label: "Café", emoji: "☕", defaultMl: 100 },
  refrigerante_diet: { label: "Refri diet/zero", emoji: "🥤", defaultMl: 350 },
  outra: { label: "Outra", emoji: "🧃", defaultMl: 250 },
};

export function isBeverageKind(value: string): value is BeverageKind {
  return (BEVERAGE_KINDS as readonly string[]).includes(value);
}

export function isHydrating(kind: string): boolean {
  return (HYDRATING_KINDS as readonly string[]).includes(kind);
}
