import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { isUnusableCompletion, parseMealJson, sumMealItems } from "@/lib/ai/parse-meal";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";

// Estimativa nutricional a partir só do nome/descrição digitado — usada no
// registro rápido de "Extras" (lanche/bebida sem foto), que antes salvava
// só o nome sem nenhum valor de caloria/macro, ficando de fora dos totais
// do dia sem o usuário perceber.

const bodySchema = z.object({ description: z.string().min(1).max(300) });

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
    return NextResponse.json({ error: "Descreva o que foi consumido." }, { status: 400 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "KIMI_API_KEY não configurada no servidor.", demo: true },
      { status: 503 }
    );
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "meal_text");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  const openai = createAiClient();

  let completion;
  try {
    completion = await openai.chat.completions.create({
      ...aiProviderOptions(),
      model: aiModel(),
      messages: [
        {
          role: "user",
          content:
            `Estime a nutrição de: "${parsed.data.description}"\n\n` +
            "Responda APENAS um JSON válido com as chaves:\n" +
            "- items: array com um objeto por item de comida/bebida distinto na descrição, cada um com name (string curta), calories (int estimado), carbs_g, protein_g, fat_g. Se não der pra identificar nenhum item de comida, use items: [].\n" +
            "- glycemic_load_estimate (0-100)\n" +
            "- notes (string breve em pt-BR, deixe claro que é uma estimativa por texto, sem foto)",
        },
      ],
      max_tokens: 800,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  const choice = completion.choices[0];
  // Falhar explicitamente em vez de devolver a refeição zerada — zero em tudo
  // é indistinguível de uma estimativa legítima na tela.
  if (isUnusableCompletion(choice?.message?.content, choice?.finish_reason)) {
    return NextResponse.json(
      { error: "A IA não conseguiu estimar essa descrição. Tente descrever de forma mais simples." },
      { status: 502 }
    );
  }

  const rawParsed = parseMealJson(choice?.message?.content ?? "{}");
  const totals = sumMealItems(rawParsed);

  return NextResponse.json({
    meal: {
      ...totals,
      glycemic_load_estimate: rawParsed.glycemic_load_estimate ?? 0,
      notes: rawParsed.notes ?? "",
    },
  });
}

export const runtime = "nodejs";
export const maxDuration = 30;
