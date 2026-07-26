/**
 * Catálogo das medidas corporais — fonte única para formulário, tabela,
 * gráficos, metas e prompt da IA.
 *
 * Um array só em vez de repetir a lista em cada tela: são 21 campos, e o custo
 * de esquecer um campo novo em 5 lugares diferentes é uma tela que mostra dado
 * pela metade sem erro nenhum.
 */

export type BodyFieldGroup = "peso" | "tronco" | "membros" | "dobra";

/**
 * Papel da medida na leitura de composição:
 * - `musculo`: crescer é o resultado buscado em hipertrofia
 * - `gordura`: reduzir é o resultado buscado (cintura/abdômen)
 * - `neutro`: entra no cálculo (pescoço, quadril) mas não é meta em si
 */
export type BodyFieldRole = "musculo" | "gordura" | "neutro";

export type BodyField = {
  key: BodyMeasurementKey;
  label: string;
  /** Rótulo curto para tabela/gráfico onde não cabe o nome inteiro. */
  short: string;
  unit: "kg" | "cm" | "mm";
  group: BodyFieldGroup;
  role: BodyFieldRole;
  /** Instrução de medição — medida repetida em ponto diferente não é evolução. */
  hint?: string;
};

export type BodyMeasurementKey =
  | "weight_kg"
  | "waist_cm"
  | "abdomen_cm"
  | "hip_cm"
  | "chest_cm"
  | "shoulders_cm"
  | "neck_cm"
  | "arm_right_relaxed_cm"
  | "arm_left_relaxed_cm"
  | "arm_right_flexed_cm"
  | "arm_left_flexed_cm"
  | "forearm_cm"
  | "thigh_right_cm"
  | "thigh_left_cm"
  | "calf_right_cm"
  | "calf_left_cm"
  | "skf_triceps_mm"
  | "skf_suprailiac_mm"
  | "skf_abdominal_mm"
  | "skf_chest_mm"
  | "skf_thigh_mm";

export const BODY_FIELDS: BodyField[] = [
  { key: "weight_kg", label: "Peso", short: "Peso", unit: "kg", group: "peso", role: "neutro", hint: "De manhã, em jejum, depois do banheiro." },

  { key: "waist_cm", label: "Cintura (umbigo)", short: "Cintura", unit: "cm", group: "tronco", role: "gordura", hint: "Na linha do umbigo, fita paralela ao chão, sem apertar." },
  { key: "abdomen_cm", label: "Abdômen", short: "Abdômen", unit: "cm", group: "tronco", role: "gordura", hint: "No ponto mais largo do abdômen, expiração normal." },
  { key: "hip_cm", label: "Quadril", short: "Quadril", unit: "cm", group: "tronco", role: "neutro", hint: "Na maior circunferência dos glúteos." },
  { key: "chest_cm", label: "Peitoral", short: "Peito", unit: "cm", group: "tronco", role: "musculo", hint: "Na linha dos mamilos, braços relaxados." },
  { key: "shoulders_cm", label: "Ombros (circunferência)", short: "Ombros", unit: "cm", group: "tronco", role: "musculo", hint: "No ponto mais largo dos deltoides." },
  { key: "neck_cm", label: "Pescoço", short: "Pescoço", unit: "cm", group: "tronco", role: "neutro", hint: "Abaixo do pomo de adão. Entra no cálculo de % de gordura." },

  { key: "arm_right_relaxed_cm", label: "Braço direito relaxado", short: "Braço D", unit: "cm", group: "membros", role: "musculo", hint: "Braço solto ao lado do corpo, no ponto médio." },
  { key: "arm_left_relaxed_cm", label: "Braço esquerdo relaxado", short: "Braço E", unit: "cm", group: "membros", role: "musculo" },
  { key: "arm_right_flexed_cm", label: "Braço direito contraído", short: "Braço D (contr.)", unit: "cm", group: "membros", role: "musculo", hint: "Cotovelo a 90°, bíceps contraído." },
  { key: "arm_left_flexed_cm", label: "Braço esquerdo contraído", short: "Braço E (contr.)", unit: "cm", group: "membros", role: "musculo" },
  { key: "forearm_cm", label: "Antebraço", short: "Antebraço", unit: "cm", group: "membros", role: "musculo", hint: "No ponto mais grosso, punho neutro." },
  { key: "thigh_right_cm", label: "Coxa direita", short: "Coxa D", unit: "cm", group: "membros", role: "musculo", hint: "No ponto médio entre virilha e joelho." },
  { key: "thigh_left_cm", label: "Coxa esquerda", short: "Coxa E", unit: "cm", group: "membros", role: "musculo" },
  { key: "calf_right_cm", label: "Panturrilha direita", short: "Pant. D", unit: "cm", group: "membros", role: "musculo", hint: "No ponto mais grosso, em pé." },
  { key: "calf_left_cm", label: "Panturrilha esquerda", short: "Pant. E", unit: "cm", group: "membros", role: "musculo" },

  { key: "skf_triceps_mm", label: "Dobra tricipital", short: "D. tríceps", unit: "mm", group: "dobra", role: "gordura", hint: "Requer adipômetro. Ponto médio posterior do braço." },
  { key: "skf_suprailiac_mm", label: "Dobra supra-ilíaca", short: "D. supra-ilíaca", unit: "mm", group: "dobra", role: "gordura" },
  { key: "skf_abdominal_mm", label: "Dobra abdominal", short: "D. abdominal", unit: "mm", group: "dobra", role: "gordura" },
  { key: "skf_chest_mm", label: "Dobra peitoral", short: "D. peitoral", unit: "mm", group: "dobra", role: "gordura" },
  { key: "skf_thigh_mm", label: "Dobra da coxa", short: "D. coxa", unit: "mm", group: "dobra", role: "gordura" },
];

export const BODY_FIELD_BY_KEY: Record<BodyMeasurementKey, BodyField> = Object.fromEntries(
  BODY_FIELDS.map((f) => [f.key, f])
) as Record<BodyMeasurementKey, BodyField>;

export const BODY_FIELD_KEYS: BodyMeasurementKey[] = BODY_FIELDS.map((f) => f.key);

export function isBodyMeasurementKey(v: string): v is BodyMeasurementKey {
  return (BODY_FIELD_KEYS as string[]).includes(v);
}

export const GROUP_LABEL: Record<BodyFieldGroup, string> = {
  peso: "Peso",
  tronco: "Tronco",
  membros: "Membros",
  dobra: "Dobras cutâneas (opcional)",
};

export const GROUP_ORDER: BodyFieldGroup[] = ["peso", "tronco", "membros", "dobra"];

export function fieldsByGroup(group: BodyFieldGroup): BodyField[] {
  return BODY_FIELDS.filter((f) => f.group === group);
}

/** Uma linha de `body_measurements` do ponto de vista do cálculo. */
export type BodyMeasurement = { measured_on: string } & Partial<
  Record<BodyMeasurementKey, number | null>
>;

export function measurementValue(
  m: BodyMeasurement | null | undefined,
  key: BodyMeasurementKey
): number | null {
  const v = m?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Média dos dois lados quando ambos existem; o lado disponível quando só um foi medido. */
export function bilateralAverage(
  m: BodyMeasurement | null | undefined,
  right: BodyMeasurementKey,
  left: BodyMeasurementKey
): number | null {
  const r = measurementValue(m, right);
  const l = measurementValue(m, left);
  if (r != null && l != null) return Math.round(((r + l) / 2) * 10) / 10;
  return r ?? l;
}
