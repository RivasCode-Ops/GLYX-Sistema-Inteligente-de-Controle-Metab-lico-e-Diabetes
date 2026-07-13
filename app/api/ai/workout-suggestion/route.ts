import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { parseMealJson } from "@/lib/ai/parse-meal";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  splitLabel: z.string().min(1),
  muscleLabels: z.array(z.string().min(1)).min(1).max(3),
  trainingType: z.enum(["forca", "resistencia"]),
});

const TRAINING_SCHEME: Record<"forca" | "resistencia", string> = {
  forca: "força: 4 séries de 4 a 6 repetições, descanso de ~120s entre séries, carga alta",
  resistencia: "resistência: 3 séries de 15 a 20 repetições, descanso de ~45s entre séries, carga moderada",
};

export async function POST(req: Request) {
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY não configurada no servidor.", demo: true }, { status: 503 });
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "workout_suggestion");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("body_goal, diabetes_type")
    .eq("id", user.id)
    .maybeSingle();

  const { splitLabel, muscleLabels, trainingType } = parsed.data;
  const musclesList = muscleLabels.map((m) => `"${m}"`).join(", ");

  const prompt = `Sugira um treino curto de ${splitLabel} para os grupos musculares ${musclesList} no mesmo dia, estilo de treino de ${TRAINING_SCHEME[trainingType]}.
${profile?.body_goal ? `Objetivo do usuário: ${profile.body_goal === "lose" ? "emagrecer" : profile.body_goal === "gain" ? "ganhar massa muscular" : "manter"}.` : ""}
${profile?.diabetes_type ? `Contexto: pessoa com diabetes (${profile.diabetes_type}) — evite recomendações de intensidade que aumentem risco de hipoglicemia sem aviso.` : ""}
Responda APENAS um JSON válido com: exercises (array com até 2 exercícios por grupo muscular listado, cada um com "muscle" — um dos valores ${musclesList} — e "name", nome curto do exercício em português), e tip (string curta em português com uma orientação de segurança/execução para esse treino).`;

  let completion;
  try {
    completion = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
      model: aiModel(),
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.6,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsedResult = parseMealJson(raw) as {
    exercises?: { muscle?: string; name?: string }[];
    tip?: string;
  };

  return NextResponse.json({
    exercises: (parsedResult.exercises ?? []).map((e) => ({
      muscle: String(e.muscle ?? ""),
      name: String(e.name ?? ""),
    })),
    tip: parsedResult.tip ? String(parsedResult.tip) : "",
  });
}

export const runtime = "nodejs";
export const maxDuration = 30;
