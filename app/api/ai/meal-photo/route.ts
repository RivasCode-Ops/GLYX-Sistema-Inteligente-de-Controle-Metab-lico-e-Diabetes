import { NextResponse } from "next/server";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { parseMealJson, sumMealItems } from "@/lib/ai/parse-meal";
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
        error: "KIMI_API_KEY não configurada no servidor.",
        demo: true,
      },
      { status: 503 }
    );
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "meal_photo");
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
          content: [
            {
              type: "text",
              text:
                "Analise esta foto de refeição com atenção a TODOS os itens distintos visíveis — inclua caldos, molhos, acompanhamentos pequenos e bebidas, não apenas o prato principal. Não ignore nenhum item só porque é pequeno ou está num recipiente separado. Cada item vai virar um registro SEPARADO no diário do paciente (não uma refeição só somada), então trate cada um como uma entrada independente.\n\n" +
                "Responda APENAS um JSON válido com as chaves:\n" +
                "- items: array com um objeto por item de comida/bebida distinto identificado na foto, cada um com:\n" +
                "  - name (string curta)\n" +
                "  - calories (int estimado), carbs_g, protein_g, fat_g\n" +
                "  - glycemic_load_estimate (0-100, carga glicêmica só DESTE item isolado, não do conjunto)\n" +
                "  - implication (string curta em pt-BR, 1 frase, sobre o que ESSE item específico implica pro controle glicêmico — ex.: \"Bebida açucarada de absorção rápida — considere consumir separada da refeição principal ou trocar por versão sem açúcar.\" Se o item for neutro/de baixo impacto, diga isso brevemente em vez de inventar um risco.)\n" +
                "  Se a foto não tiver comida, use items: [].\n" +
                "- notes (string breve em pt-BR sobre a refeição como um todo)\n" +
                "- eating_order_tip (string curta em pt-BR sugerindo a ordem de consumir os itens visíveis para reduzir pico glicêmico — ex.: comer a salada e a proteína antes do arroz/carboidrato, e deixar a bebida açucarada por último ou fora da refeição; se não houver itens distintos para ordenar, use string vazia).\n\n" +
                "Isto é educativo, não é orientação médica — não prescreva doses nem diga para pular/trocar medicação.",
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
      max_tokens: 700,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = parseMealJson(raw);
  const totals = sumMealItems(parsed);
  // Carga glicêmica é por item agora (a bebida pode pesar diferente do
  // prato) — a média dá só um resumo geral pra quem quiser um número único.
  const avgGlycemicLoad = totals.items.length
    ? Math.round(
        totals.items.reduce((acc, it) => acc + (it.glycemic_load_estimate ?? 0), 0) /
          totals.items.length
      )
    : 0;

  // Só analisa — o usuário revisa e decide se conta no consumo diário
  // (ação separada salva, com a mesma foto reenviada pelo cliente).
  return NextResponse.json({
    meal: {
      ...totals,
      glycemic_load_estimate: avgGlycemicLoad,
      notes: parsed.notes ?? "",
      eating_order_tip: parsed.eating_order_tip ?? "",
    },
    saved: false,
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;
