import type {
  ExerciseSession,
  GlucoseReading,
  HealthSnapshot,
  InsightFinding,
  Meal,
  Medication,
  MetabolicAlert,
  Profile,
} from "@/types/database";
import type { GlucosePoint } from "@/lib/queries/glucose-series";

const userId = "demo-user";
const now = new Date();

function at(daysAgo: number, hour: number, minute = 0): string {
  const d = new Date(now);
  d.setDate(now.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function day(daysAgo: number): string {
  return at(daysAgo, 12).slice(0, 10);
}

export const demoProfile: Profile = {
  id: userId,
  full_name: "Marina Costa",
  diabetes_type: "DM2 - acompanhamento metabólico",
  target_glucose_min: 80,
  target_glucose_max: 160,
  timezone: "America/Sao_Paulo",
  created_at: at(60, 9),
  updated_at: at(0, 8),
};

const glucosePattern = [
  [112, 128, 137],
  [104, 116, 151],
  [118, 143, 162],
  [96, 121, 134],
  [108, 132, 149],
  [122, 159, 172],
  [101, 119, 141],
  [94, 111, 127],
  [115, 138, 155],
  [107, 126, 146],
  [99, 118, 135],
  [124, 168, 181],
  [109, 129, 144],
  [102, 117, 133],
];

export const demoGlucoseReadings: GlucoseReading[] = glucosePattern.flatMap((values, daysAgo) =>
  values.map((value, idx) => ({
    id: `glucose-${daysAgo}-${idx}`,
    user_id: userId,
    value_mg_dl: value,
    context: idx === 0 ? "jejum" : idx === 1 ? "pos-prandial" : "noite",
    source: daysAgo < 7 ? "cgm_demo" : "manual",
    recorded_at: at(daysAgo, [7, 13, 21][idx], idx === 1 ? 20 : 0),
    notes: idx === 1 && value > 155 ? "Pico após refeição com maior carga glicêmica." : null,
    external_id: `demo-${daysAgo}-${idx}`,
    trend: value >= 160 ? "rising" : value <= 100 ? "stable" : "flat",
    metadata: { demo: true },
    created_at: at(daysAgo, [7, 13, 21][idx], idx === 1 ? 20 : 0),
  }))
);

export const demoMeals: Meal[] = [
  {
    id: "meal-1",
    user_id: userId,
    name: "Café da manhã proteico",
    calories: 390,
    carbs_g: 34,
    protein_g: 28,
    fat_g: 16,
    glycemic_load_estimate: 12,
    notes: "Iogurte natural, aveia, chia e morangos.",
    photo_path: null,
    eaten_at: at(0, 7, 45),
    created_at: at(0, 7, 50),
  },
  {
    id: "meal-2",
    user_id: userId,
    name: "Almoço mediterrâneo",
    calories: 620,
    carbs_g: 58,
    protein_g: 42,
    fat_g: 24,
    glycemic_load_estimate: 21,
    notes: "Arroz integral, frango grelhado, salada e azeite.",
    photo_path: null,
    eaten_at: at(0, 12, 35),
    created_at: at(0, 12, 45),
  },
  {
    id: "meal-3",
    user_id: userId,
    name: "Jantar leve",
    calories: 470,
    carbs_g: 36,
    protein_g: 35,
    fat_g: 18,
    glycemic_load_estimate: 14,
    notes: "Sopa de legumes com ovos e torrada integral.",
    photo_path: null,
    eaten_at: at(1, 19, 20),
    created_at: at(1, 19, 25),
  },
];

export const demoExercises: ExerciseSession[] = [
  {
    id: "session-1",
    user_id: userId,
    label: "Caminhada rápida",
    duration_min: 38,
    calories_burned: 210,
    intensity: "moderada",
    started_at: at(0, 18, 10),
    notes: "Glicemia estabilizou 40 min após o almoço.",
    created_at: at(0, 19),
  },
  {
    id: "session-2",
    user_id: userId,
    label: "Treino de força - superiores",
    duration_min: 45,
    calories_burned: 260,
    intensity: "moderada",
    started_at: at(2, 7, 15),
    notes: "Sem hipoglicemia no pós-treino.",
    created_at: at(2, 8, 10),
  },
];

export const demoMedications: Medication[] = [
  {
    id: "med-1",
    user_id: userId,
    name: "Metformina",
    dosage: "500 mg",
    schedule_hint: "café da manhã e jantar",
    active: true,
    notes: "Acompanhamento médico obrigatório.",
    created_at: at(50, 9),
  },
  {
    id: "med-2",
    user_id: userId,
    name: "Vitamina D",
    dosage: "2000 UI",
    schedule_hint: "almoço",
    active: true,
    notes: null,
    created_at: at(45, 9),
  },
];

export const demoMedicationLogs = [
  {
    id: "log-1",
    taken_at: at(0, 7, 40),
    medications: { name: "Metformina", dosage: "500 mg" },
  },
  {
    id: "log-2",
    taken_at: at(1, 20, 10),
    medications: { name: "Metformina", dosage: "500 mg" },
  },
  {
    id: "log-3",
    taken_at: at(1, 12, 50),
    medications: { name: "Vitamina D", dosage: "2000 UI" },
  },
];

export const demoAlerts: MetabolicAlert[] = [
  {
    id: "alert-1",
    user_id: userId,
    severity: "warning",
    title: "Pico pós-prandial recorrente",
    body: "Dois almoços da semana ultrapassaram 160 mg/dL entre 60 e 90 minutos após a refeição.",
    context: { module: "alimentacao", demo: true },
    read_at: null,
    created_at: at(0, 14, 30),
  },
  {
    id: "alert-2",
    user_id: userId,
    severity: "info",
    title: "Sono adequado correlacionado com melhor manhã",
    body: "Dias com sono acima de 7h tiveram média de jejum 11 mg/dL menor no conjunto demo.",
    context: { module: "insights", demo: true },
    read_at: null,
    created_at: at(1, 9, 15),
  },
];

export const demoHealthSnapshots: HealthSnapshot[] = [
  {
    id: "health-1",
    user_id: userId,
    snapshot_date: day(0),
    source: "mock",
    steps: 8420,
    sleep_hours: 7.2,
    resting_hr: 62,
    active_calories: 430,
    stress_score: 34,
    metadata: { demo: true },
    updated_at: at(0, 8),
    created_at: at(0, 8),
  },
];

export const demoInsights: InsightFinding[] = [
  {
    id: "insight-1",
    user_id: userId,
    slug: "carb-load-lunch-spike",
    title: "Almoço com maior carga glicêmica elevou a curva da tarde",
    body: "Nos dias com mais de 55 g de carboidratos no almoço, a média entre 13h e 16h subiu 18 mg/dL. A sugestão da demo é testar mais fibra e caminhada curta no pós-prandial.",
    severity: "warning",
    metrics: { deltaMgDl: 18, sampleDays: 5 },
    computed_at: at(0, 8, 20),
  },
  {
    id: "insight-2",
    user_id: userId,
    slug: "sleep-glucose-morning",
    title: "Sono acima de 7h melhorou a glicemia de jejum",
    body: "A amostra demo mostra jejum médio de 103 mg/dL após noites com sono suficiente, contra 117 mg/dL nos demais dias.",
    severity: "info",
    metrics: { fastingDelta: -14, sampleDays: 8 },
    computed_at: at(0, 8, 21),
  },
];

export const demoExams = [
  { id: "exam-1", title: "Hemoglobina glicada - abril", created_at: at(6, 10) },
  { id: "exam-2", title: "Perfil lipídico - check-up", created_at: at(18, 16) },
  { id: "exam-3", title: "Função renal - rotina", created_at: at(31, 11) },
];

export const demoTimeline = [
  { id: "tl-4", type: "exercício" as const, label: "Exercício", detail: "Caminhada rápida - 38 min", at: at(0, 18, 10) },
  { id: "tl-1", type: "glicemia" as const, label: "Glicemia", detail: "137 mg/dL - pós-prandial", at: at(0, 13, 20) },
  { id: "tl-2", type: "refeição" as const, label: "Refeição", detail: "Almoço mediterrâneo - 58 g carb", at: at(0, 12, 35) },
  { id: "tl-3", type: "medicação" as const, label: "Medicação", detail: "Metformina confirmada", at: at(0, 7, 40) },
];

export const demoGlucosePoints: GlucosePoint[] = demoGlucoseReadings.map((r) => ({
  id: r.id,
  value_mg_dl: r.value_mg_dl,
  recorded_at: r.recorded_at,
}));

export const demoSummary = {
  latestGlucose: demoGlucoseReadings[0]?.value_mg_dl ?? null,
  carbsToday: demoMeals
    .filter((meal) => meal.eaten_at.slice(0, 10) === day(0))
    .reduce((sum, meal) => sum + (meal.carbs_g ?? 0), 0),
  activeMinutes: demoExercises
    .filter((session) => session.started_at.slice(0, 10) === day(0))
    .reduce((sum, session) => sum + (session.duration_min ?? 0), 0),
  riskLabel: "Baixo",
  stepsToday: demoHealthSnapshots[0]?.steps ?? null,
  sleepHoursToday: demoHealthSnapshots[0]?.sleep_hours ?? null,
};
