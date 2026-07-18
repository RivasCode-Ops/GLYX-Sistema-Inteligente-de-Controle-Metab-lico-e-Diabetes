// Unidades de dose usadas tanto no cadastro manual (medicacao/page.tsx)
// quanto no cadastro por foto (add-by-photo.tsx) — antes duplicado nos dois
// arquivos, que podiam divergir silenciosamente.
export const DOSE_UNITS = [
  "mg",
  "g",
  "mcg",
  "ml",
  "U",
  "comprimido(s)",
  "cápsula(s)",
  "scoop",
  "gota(s)",
] as const;

export function doseUnitLabel(unit: string): string {
  if (unit === "U") return "U (insulina)";
  if (unit === "g") return "g (whey/creatina)";
  return unit;
}
