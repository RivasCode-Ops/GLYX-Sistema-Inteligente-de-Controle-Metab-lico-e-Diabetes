export type MuscleGroupId =
  | "peito"
  | "costas"
  | "trapezio"
  | "quadriceps"
  | "posterior"
  | "gluteos"
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
  /**
   * Ordem de exibição. Explícita e espaçada de 10 em 10 para que inserir um
   * grupo novo no meio não obrigue a renumerar os outros — foi exatamente o que
   * aconteceu com trapézio e glúteos.
   */
  displayOrder: number;
};

/**
 * Definição por id, em `Record` **completo** — esta é a estrutura de origem, e a
 * escolha é deliberada.
 *
 * Antes isto era um array literal, e por isso crescer `MuscleGroupId` não
 * quebrava nada: o compilador aceitava um id sem definição, e como
 * `computeMuscleRecovery` e `computeWeeklyVolume` iteram **sobre** esta lista, o
 * grupo faltante não virava erro nem zero — ele simplesmente sumia de todas as
 * telas, sem deixar rastro. Um `Record<MuscleGroupId, _>` transforma esse
 * esquecimento em erro de compilação.
 *
 * O `id` não aparece aqui de propósito: ele é a própria chave, e repeti-lo
 * abriria espaço para a chave `peito` guardar `id: "costas"`. Ele é acrescentado
 * ao derivar a lista abaixo.
 *
 * Janelas de recuperação são orientação geral de treino de força (grupos grandes
 * recuperam mais devagar, pequenos mais rápido), não prescrição individual.
 * Valores de referência com faixa (ex.: costas 48-72h, bíceps 24-48h) usam o
 * ponto médio.
 */
const MUSCLE_GROUP_DEFS: Record<MuscleGroupId, Omit<MuscleGroupDef, "id">> = {
  peito: { label: "Peito", recoveryHours: 48, displayOrder: 10 },
  costas: { label: "Costas", recoveryHours: 60, displayOrder: 20 },
  trapezio: { label: "Trapézio", recoveryHours: 48, displayOrder: 30 },
  // Quadríceps e posterior são grupos separados porque um treino de perna
  // não recupera o outro: dar 72h ao "pernas" inteiro fazia um plano legítimo
  // (quadríceps na segunda, posterior na quarta) aparecer como conflito.
  quadriceps: { label: "Quadríceps", recoveryHours: 72, displayOrder: 40 },
  posterior: { label: "Posterior de coxa", recoveryHours: 72, displayOrder: 50 },
  gluteos: { label: "Glúteos", recoveryHours: 60, displayOrder: 60 },
  ombros: { label: "Ombros", recoveryHours: 48, displayOrder: 70 },
  biceps: { label: "Bíceps", recoveryHours: 36, displayOrder: 80 },
  triceps: { label: "Tríceps", recoveryHours: 48, displayOrder: 90 },
  abdomen: { label: "Abdômen", recoveryHours: 24, displayOrder: 100 },
  panturrilhas: { label: "Panturrilhas", recoveryHours: 48, displayOrder: 110 },
  antebracos: { label: "Antebraços", recoveryHours: 36, displayOrder: 120 },
};

/** Lista ordenada para exibição — derivada, nunca escrita à mão. */
export const MUSCLE_GROUPS: MuscleGroupDef[] = (
  Object.entries(MUSCLE_GROUP_DEFS) as [MuscleGroupId, Omit<MuscleGroupDef, "id">][]
)
  .map(([id, def]) => ({ id, ...def }))
  .sort((a, b) => a.displayOrder - b.displayOrder);

export const MUSCLE_GROUP_BY_ID: Record<MuscleGroupId, MuscleGroupDef> = Object.fromEntries(
  MUSCLE_GROUPS.map((g) => [g.id, g])
) as Record<MuscleGroupId, MuscleGroupDef>;

export const MUSCLE_GROUP_IDS: MuscleGroupId[] = MUSCLE_GROUPS.map((g) => g.id);

/**
 * Registros próprios abaixo dos quais o app não afirma nada sobre o grupo.
 *
 * Trapézio e glúteos entraram no modelo em 2026-07-30 com histórico zero, sem
 * backfill por decisão (reetiquetar texto livre seria chute gravado como dado).
 * Mas encolhimento e elevação pélvica **são** treinados — estavam registrados
 * como costas e posterior. Sem esta guarda, o primeiro dia depois da ponte
 * produziria "trapézio nunca estimulado, prioridade máxima" e "glúteos
 * negligenciados": alarme falso garantido, e logo nos dois grupos novos, que é
 * onde ele mais corrói a confiança no resto do diagnóstico.
 *
 * É contagem própria e não janela por data porque data de corte vira código
 * morto que ninguém lembra de remover; a contagem se desliga sozinha assim que o
 * grupo passa a ser registrado como ele mesmo.
 */
export const MIN_LOGS_FOR_ESTABLISHED_HISTORY = 3;

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
