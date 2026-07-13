import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { sendToSubscription } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";

// Quantas sugestões processamos ao mesmo tempo. Sequencial (1 por vez)
// arrisca estourar o timeout de 60s da function quando muitos usuários
// vencem a janela do mesmo horário de refeição; concorrência alta demais
// arrisca rate limit da OpenAI. 5 é um meio-termo seguro para o volume
// atual de usuários.
const CONCURRENCY = 5;

// Chamado pelo pg_cron do Supabase (dispatch_meal_suggestions, a cada
// 15 min) com a lista de usuários que não registraram a refeição do
// horário. O banco já decidiu QUEM está devendo e QUANDO (dedupe,
// janela de horário); esta rota só faz o que o Postgres não pode:
// gerar a sugestão por IA e disparar o push.

const MEAL_LABEL: Record<string, string> = {
  breakfast: "café da manhã",
  lunch: "almoço",
  dinner: "jantar",
};

const itemSchema = z.object({
  userId: z.string().uuid(),
  mealType: z.enum(["breakfast", "lunch", "dinner"]),
  bodyGoal: z.string().nullable().optional(),
  diabetesType: z.string().nullable().optional(),
  latestGlucose: z.number().nullable().optional(),
  caloriesToday: z.number().optional(),
  carbsToday: z.number().optional(),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

type SuggestItem = z.infer<typeof itemSchema>;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = z.array(itemSchema).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  if (!isOpenAIConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "IA não configurada." });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const supabase = await createClient();

  async function processItem(item: SuggestItem): Promise<boolean> {
    const mealLabel = MEAL_LABEL[item.mealType];
    const goalLine =
      item.bodyGoal === "lose"
        ? "Objetivo: emagrecer — priorize proteína e vegetais, carboidrato moderado."
        : item.bodyGoal === "gain"
          ? "Objetivo: ganhar massa muscular — proteína generosa, carboidrato de qualidade."
          : "Objetivo: manter/controlar a glicemia.";

    const prompt = `Sugira em UMA frase curta (máx. 25 palavras, português do Brasil) o que comer agora no ${mealLabel}, para uma pessoa com diabetes que ainda não registrou essa refeição hoje.
${goalLine}
${item.diabetesType ? `Contexto: ${item.diabetesType}.` : ""}
${item.latestGlucose != null ? `Última glicemia: ${item.latestGlucose} mg/dL.` : ""}
${item.caloriesToday ? `Já consumiu ${item.caloriesToday} kcal e ${item.carbsToday ?? 0}g de carboidrato hoje.` : "Ainda não registrou nada hoje."}
Seja prático e direto (ex.: "Prefira proteína magra com salada e pouco arroz"). Sem markdown, sem aspas, só a frase.`;

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: aiModel(),
        messages: [{ role: "user", content: prompt }],
        max_tokens: 80,
        temperature: 0.5,
      });
    } catch {
      return false; // um usuário falhar não deve travar os demais
    }

    const suggestion = completion.choices[0]?.message?.content?.trim();
    if (!suggestion) return false;

    const alive = await sendToSubscription(
      { endpoint: item.endpoint, p256dh: item.p256dh, auth: item.auth },
      {
        title: `🍽️ Hora do ${mealLabel}`,
        body: suggestion,
        url: "/alimentacao/foto",
        critical: false,
      }
    );

    if (supabase && completion.usage) {
      await supabase.rpc("record_system_ai_usage", {
        p_user_id: item.userId,
        p_kind: "meal_suggest",
        p_prompt_tokens: completion.usage.prompt_tokens ?? null,
        p_completion_tokens: completion.usage.completion_tokens ?? null,
        p_model: aiModel(),
        p_secret: secret,
      });
    }

    return alive;
  }

  const results = await mapWithConcurrency(parsed.data, CONCURRENCY, processItem);
  const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;

  return NextResponse.json({ ok: true, sent });
}

export const runtime = "nodejs";
export const maxDuration = 60;
