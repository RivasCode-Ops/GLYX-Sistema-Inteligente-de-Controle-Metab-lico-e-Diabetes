export type BloodPressureTier = "normal" | "elevada" | "estagio1" | "estagio2" | "crise";

export const BLOOD_PRESSURE_TIER_LABEL: Record<BloodPressureTier, string> = {
  normal: "Normal",
  elevada: "Elevada",
  estagio1: "Hipertensão estágio 1",
  estagio2: "Hipertensão estágio 2",
  crise: "Crise hipertensiva",
};

/** Faixas de referência geral (semelhante à diretriz AHA) — não é diagnóstico. */
export function classifyBloodPressure(systolic: number, diastolic: number): BloodPressureTier {
  if (systolic >= 180 || diastolic >= 120) return "crise";
  if (systolic >= 140 || diastolic >= 90) return "estagio2";
  if (systolic >= 130 || diastolic >= 80) return "estagio1";
  if (systolic >= 120) return "elevada";
  return "normal";
}
