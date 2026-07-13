export type MuscleGroupId =
  | "peito"
  | "costas"
  | "pernas"
  | "ombros"
  | "biceps"
  | "triceps"
  | "abdomen"
  | "panturrilhas"
  | "antebracos";

export type MuscleGroupDef = {
  id: MuscleGroupId;
  label: string;
  /** Janela de recuperação padrão até o grupo ser considerado pronto de novo. */
  recoveryHours: number;
};

/**
 * Janelas de recuperação por grupo — orientação geral de treino de força
 * (grupos grandes recuperam mais devagar, pequenos mais rápido), não
 * prescrição individual. Valores de referência com faixa (ex.: costas
 * 48-72h, bíceps 24-48h) usam o ponto médio.
 */
export const MUSCLE_GROUPS: MuscleGroupDef[] = [
  { id: "peito", label: "Peito", recoveryHours: 48 },
  { id: "costas", label: "Costas", recoveryHours: 60 },
  { id: "pernas", label: "Pernas", recoveryHours: 72 },
  { id: "ombros", label: "Ombros", recoveryHours: 48 },
  { id: "biceps", label: "Bíceps", recoveryHours: 36 },
  { id: "triceps", label: "Tríceps", recoveryHours: 48 },
  { id: "abdomen", label: "Abdômen", recoveryHours: 24 },
  { id: "panturrilhas", label: "Panturrilhas", recoveryHours: 48 },
  { id: "antebracos", label: "Antebraços", recoveryHours: 36 },
];

export const MUSCLE_GROUP_IDS: MuscleGroupId[] = MUSCLE_GROUPS.map((g) => g.id);

export function isMuscleGroupId(v: string): v is MuscleGroupId {
  return (MUSCLE_GROUP_IDS as string[]).includes(v);
}
