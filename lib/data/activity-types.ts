export type ActivityKind = "cardio" | "forca" | "outro";

export type ActivityTypeId =
  | "corrida"
  | "bicicleta"
  | "caminhada"
  | "forca"
  | "outro";

export type ActivityTypeDef = {
  id: ActivityTypeId;
  label: string;
  kind: ActivityKind;
};

/**
 * Tipos de atividade estruturados. Antes, corrida e bicicleta só existiam
 * como texto livre no campo "Atividade" — impossível agregar de forma
 * confiável ("quanto pedalei na semana") porque cada registro era escrito
 * de um jeito. Aqui viram valores fixos, com `kind` separando cardio de
 * força para os resumos semanais.
 */
export const ACTIVITY_TYPES: ActivityTypeDef[] = [
  { id: "corrida", label: "Corrida", kind: "cardio" },
  { id: "bicicleta", label: "Bicicleta", kind: "cardio" },
  { id: "caminhada", label: "Caminhada", kind: "cardio" },
  { id: "forca", label: "Treino de força", kind: "forca" },
  { id: "outro", label: "Outro", kind: "outro" },
];

export const ACTIVITY_TYPE_IDS: ActivityTypeId[] = ACTIVITY_TYPES.map((a) => a.id);

export function isActivityTypeId(v: string): v is ActivityTypeId {
  return (ACTIVITY_TYPE_IDS as string[]).includes(v);
}

export function activityTypeLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return ACTIVITY_TYPES.find((a) => a.id === id)?.label ?? null;
}

export function activityKind(id: string | null | undefined): ActivityKind | null {
  if (!id) return null;
  return ACTIVITY_TYPES.find((a) => a.id === id)?.kind ?? null;
}

/**
 * Intensidade estruturada. "regenerativo" é o caso que o usuário levantou:
 * uma pedalada leve de recuperação ativa conta minutos e contexto glicêmico,
 * mas não é estímulo de treino. Como sessões de cardio não carregam
 * `muscle_groups`, elas já não disparam o relógio de recuperação muscular —
 * o rótulo deixa isso explícito no registro.
 */
export type IntensityLevel = "regenerativo" | "leve" | "moderada" | "forte";

export const INTENSITY_LEVELS: { id: IntensityLevel; label: string }[] = [
  { id: "regenerativo", label: "Regenerativo (recuperação ativa)" },
  { id: "leve", label: "Leve" },
  { id: "moderada", label: "Moderada" },
  { id: "forte", label: "Forte" },
];
