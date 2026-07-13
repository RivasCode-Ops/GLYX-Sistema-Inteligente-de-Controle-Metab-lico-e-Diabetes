export type MuscleGroupId = "peito" | "costas" | "pernas" | "ombros" | "bracos" | "core";

export type MuscleGroupDef = {
  id: MuscleGroupId;
  label: string;
  /** Janela de recuperação padrão até o grupo ser considerado pronto de novo. */
  recoveryHours: number;
};

/** Grupos grandes (pernas) recuperam mais devagar; pequenos (braços, core) mais rápido — orientação geral de treino de força, não prescrição individual. */
export const MUSCLE_GROUPS: MuscleGroupDef[] = [
  { id: "peito", label: "Peito", recoveryHours: 48 },
  { id: "costas", label: "Costas", recoveryHours: 48 },
  { id: "pernas", label: "Pernas", recoveryHours: 72 },
  { id: "ombros", label: "Ombros", recoveryHours: 48 },
  { id: "bracos", label: "Braços", recoveryHours: 24 },
  { id: "core", label: "Core / abdômen", recoveryHours: 24 },
];

export const MUSCLE_GROUP_IDS: MuscleGroupId[] = MUSCLE_GROUPS.map((g) => g.id);

export function isMuscleGroupId(v: string): v is MuscleGroupId {
  return (MUSCLE_GROUP_IDS as string[]).includes(v);
}
