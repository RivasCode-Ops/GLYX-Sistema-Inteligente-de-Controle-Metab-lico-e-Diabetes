export type MuscleGroupId =
  | "peito"
  | "costas"
  | "quadriceps"
  | "posterior"
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
  // Quadríceps e posterior são grupos separados porque um treino de perna
  // não recupera o outro: dar 72h ao "pernas" inteiro fazia um plano legítimo
  // (quadríceps na segunda, posterior na quarta) aparecer como conflito.
  { id: "quadriceps", label: "Quadríceps", recoveryHours: 72 },
  { id: "posterior", label: "Posterior de coxa", recoveryHours: 72 },
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

/**
 * Sessões gravadas antes da separação usavam um único grupo "pernas". Elas
 * contam como treino de quadríceps E de posterior — quem treinou "pernas"
 * mexeu nos dois, e descartar a linha faria o grupo parecer nunca treinado.
 */
const LEGACY_GROUP_MAP: Record<string, MuscleGroupId[]> = {
  pernas: ["quadriceps", "posterior"],
};

/** Ids atuais correspondentes a um valor gravado no banco (1 para 1, exceto legados). */
export function resolveMuscleGroupIds(stored: string): MuscleGroupId[] {
  if (isMuscleGroupId(stored)) return [stored];
  return LEGACY_GROUP_MAP[stored] ?? [];
}
