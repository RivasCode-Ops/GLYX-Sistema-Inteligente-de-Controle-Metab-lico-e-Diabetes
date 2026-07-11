import { NextResponse } from "next/server";
import OpenAI from "openai";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { parseMealJson } from "@/lib/ai/parse-meal";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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

  const formData = await req.formData();
  const file = formData.get("image");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Imagem obrigatória." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Imagem muito grande (máx. 4 MB). Reduza a resolução e tente de novo." },
      { status: 413 }
    );
  }
  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "O arquivo precisa ser uma imagem." }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mime = file.type || "image/jpeg";

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY não configurada no servidor.",
        demo: true,
      },
      { status: 503 }
    );
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "meal_photo");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: aiModel(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analise esta foto de refeição. Responda APENAS um JSON válido com chaves: name (string curta), calories (int estimado), carbs_g, protein_g, fat_g, glycemic_load_estimate (0-100), notes (string breve em pt-BR). Se não for comida, use name: \"indefinido\" e zeros.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${base64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 400,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = parseMealJson(raw);

  const insert = await supabase.from("meals").insert({
    user_id: user.id,
    name: String(parsed.name ?? "Refeição"),
    calories: typeof parsed.calories === "number" ? parsed.calories : null,
    carbs_g: typeof parsed.carbs_g === "number" ? parsed.carbs_g : null,
    protein_g: typeof parsed.protein_g === "number" ? parsed.protein_g : null,
    fat_g: typeof parsed.fat_g === "number" ? parsed.fat_g : null,
    glycemic_load_estimate:
      typeof parsed.glycemic_load_estimate === "number" ? parsed.glycemic_load_estimate : null,
    notes: typeof parsed.notes === "string" ? parsed.notes : null,
    eaten_at: new Date().toISOString(),
  });

  if (insert.error) {
    return NextResponse.json({ error: insert.error.message }, { status: 500 });
  }

  return NextResponse.json({
    meal: parsed,
    saved: true,
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;
