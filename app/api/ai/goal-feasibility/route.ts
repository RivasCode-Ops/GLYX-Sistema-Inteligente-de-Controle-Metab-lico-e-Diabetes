import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { sanitizeForPrompt } from "@/lib/ai/sanitize-context";
import { GOAL_LABEL, bmr, dailyTargets, safeWeeklyRateKg, tdee } from "@/lib/health/energy";
import type { ActivityLevel, BodyGoal, Sex } from "@/lib/health/energy";
import { createClient } from "@/lib/supabase/server";

const resultSchema = z.object({
  verdict: z.enum(["realista", "agressiva", "arriscada"]),
  summary: z.string(),
  monthly_milestones: z.array(z.object({ month: z.number(), weight_kg: z.number() })),
  factors_for: z.array(z.string()),
  factors_against: z.array(z.string()),
  risks: z.array(z.string()),
  recommendation: z.string(),
});

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile?.sex ||
    !profile.birth_year ||
    !profile.height_cm ||
    !profile.activity_level ||
    !profile.body_goal
  ) {
    return NextResponse.json(
      { error: "Complete o perfil corporal (sexo, ano de nascimento, altura, atividade e objetivo)." },
      { status: 400 }
    );
  }

  const { data: weights } = await supabase
    .from("weight_logs")
    .select("weight_kg, logged_on")
    .eq("user_id", user.id)
    .order("logged_on", { ascending: false })
    .limit(10);

  const currentWeight = weights?.[0]?.weight_kg;
  if (!currentWeight) {
    return NextResponse.json(
      { error: "Registre seu peso atual antes da análise." },
      { status: 400 }
    );
  }

  const { data: glucose } = await supabase
    .from("glucose_readings")
    .select("value_mg_dl")
    .eq("user_id", user.id)
    .gte("recorded_at", new Date(Date.now() - 14 * 86_400_000).toISOString());
  const glucoseAvg = glucose?.length
    ? Math.round(glucose.reduce((s, g) => s + g.value_mg_dl, 0) / glucose.length)
    : null;

  const { data: meds } = await supabase
    .from("medications")
    .select("name, dosage")
    .eq("user_id", user.id)
    .eq("active", true);

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ error: "Chave de IA não configurada.", demo: true }, { status: 503 });
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "chat");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  const age = new Date().getFullYear() - profile.birth_year;
  const body = {
    sex: profile.sex as Sex,
    age,
    heightCm: profile.height_cm,
    weightKg: Number(currentWeight),
    activity: profile.activity_level as ActivityLevel,
  };
  const goal = profile.body_goal as BodyGoal;
  const targets = dailyTargets(body, goal);
  const weeklyRate = safeWeeklyRateKg(body.weightKg, goal);

  const PROMPT = `És um analista de viabilidade de metas corporais para pessoas com diabetes (PT-BR), educativo e honesto — nunca prescreves tratamento.

DADOS DO USUÁRIO:
- Objetivo: ${GOAL_LABEL[goal]}${profile.target_weight_kg ? ` | Peso-meta declarado: ${profile.target_weight_kg} kg` : ""}
- Peso atual: ${body.weightKg} kg | Altura: ${body.heightCm} cm | Idade: ${age} | Sexo: ${body.sex === "m" ? "masculino" : "feminino"}
- Atividade: ${profile.activity_level} | Diabetes: ${profile.diabetes_type ?? "não informado"}
- Glicemia média (14 dias): ${glucoseAvg ?? "sem registros"} mg/dL | Meta glicêmica: ${profile.target_glucose_min}-${profile.target_glucose_max} mg/dL
- Medicações ativas: ${meds?.length ? meds.map((m) => `${sanitizeForPrompt(m.name, 60)}${m.dosage ? ` ${sanitizeForPrompt(m.dosage, 30)}` : ""}`).join(", ") : "nenhuma registrada"}
- Histórico familiar: ${profile.family_history ?? "não informado"}
- Últimas pesagens: ${weights.map((w) => `${w.weight_kg}kg em ${w.logged_on}`).join("; ")}

CÁLCULOS JÁ FEITOS (usar como âncora, não recalcular):
- BMR ${bmr(body)} kcal | TDEE ${tdee(body)} kcal | Meta calórica: ${targets.calories} kcal/dia (${targets.deficitOrSurplus >= 0 ? "+" : ""}${targets.deficitOrSurplus}) | Proteína: ${targets.protein_g} g/dia
- Ritmo seguro: ${weeklyRate} kg/semana (ADA: déficit 500-750 kcal/dia; perda saudável 0,5-1%/semana; meta 5-7% do peso)

REGRAS:
- Se insulina ou sulfonilureia estiver nas medicações, inclua risco de hipoglicemia em déficit/exercício e recomende ajuste médico ANTES de iniciar.
- Veredito "arriscada" se a meta declarada exigir ritmo acima do seguro ou peso final abaixo de IMC 18,5.
- Marcos mensais realistas a partir do peso atual no ritmo seguro (máx. 6 meses).
- Resposta APENAS JSON válido:
{"verdict":"realista|agressiva|arriscada","summary":"2-3 frases diretas","monthly_milestones":[{"month":1,"weight_kg":0}],"factors_for":["..."],"factors_against":["..."],"risks":["..."],"recommendation":"próximo passo concreto, incluindo aval médico quando aplicável"}`;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: aiModel(),
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: PROMPT }],
      max_tokens: 900,
      temperature: 0.3,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  let json: unknown;
  try {
    json = JSON.parse(completion.choices[0]?.message?.content ?? "");
  } catch {
    return NextResponse.json({ error: "Resposta inválida do modelo. Tente novamente." }, { status: 502 });
  }
  const parsed = resultSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Formato inesperado do modelo. Tente novamente." }, { status: 502 });
  }

  return NextResponse.json({
    ...parsed.data,
    computed: {
      bmr: bmr(body),
      tdee: tdee(body),
      targets,
      weeklyRateKg: weeklyRate,
    },
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;
