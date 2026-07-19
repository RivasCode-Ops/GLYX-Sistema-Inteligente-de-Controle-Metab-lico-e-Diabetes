import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";

const MAX_PHOTOS = 4;
const MAX_TOTAL_BYTES = 3.5 * 1024 * 1024; // corpo da request na Vercel ~4.5MB

const resultSchema = z.object({
  plate: z.array(z.object({ item: z.string(), portion: z.string() })),
  rationale: z.string(),
  eatingOrder: z.array(z.string()).optional(),
  estimated: z.object({
    calories: z.number(),
    carbs_g: z.number(),
    protein_g: z.number(),
    fat_g: z.number(),
  }),
  tips: z.array(z.string()),
  limitations: z.string(),
});

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
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) {
    return NextResponse.json({ error: "Envie ao menos uma foto da bancada." }, { status: 400 });
  }
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Máximo de ${MAX_PHOTOS} fotos.` }, { status: 400 });
  }
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Fotos muito grandes no total. Tente novamente (o app reduz automaticamente)." },
      { status: 413 }
    );
  }
  if (files.some((f) => !f.type.startsWith("image/"))) {
    return NextResponse.json({ error: "Todos os arquivos precisam ser imagens." }, { status: 415 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "Chave de IA não configurada no servidor.", demo: true },
      { status: 503 }
    );
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "meal_photo");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  // Contexto metabólico para personalizar a sugestão
  const { data: profile } = await supabase
    .from("profiles")
    .select("target_glucose_min, target_glucose_max, diabetes_type, body_goal")
    .eq("id", user.id)
    .maybeSingle();
  const { data: lastReading } = await supabase
    .from("glucose_readings")
    .select("value_mg_dl, recorded_at")
    .eq("user_id", user.id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const goalLine =
    profile?.body_goal === "lose"
      ? "Objetivo corporal: EMAGRECER — porções menores de carboidrato, mais vegetais e proteína para saciedade."
      : profile?.body_goal === "gain"
        ? "Objetivo corporal: GANHAR MASSA MUSCULAR — priorizar proteína generosa e carboidrato de baixo IG em porção adequada."
        : "";

  const contextLines = [
    profile?.diabetes_type ? `Contexto do usuário: ${profile.diabetes_type}.` : "",
    profile ? `Meta glicêmica: ${profile.target_glucose_min}-${profile.target_glucose_max} mg/dL.` : "",
    goalLine,
    lastReading
      ? `Última glicemia: ${lastReading.value_mg_dl} mg/dL em ${lastReading.recorded_at}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const PROMPT = `És um assistente nutricional educativo para pessoas com diabetes (Português do Brasil).
As fotos mostram os alimentos/ingredientes DISPONÍVEIS numa bancada ou despensa (pode haver mais de uma foto da mesma bancada).
${contextLines}

TAREFA: montar UM prato equilibrado usando APENAS o que aparece nas fotos, favorecendo controle glicêmico
(priorizar proteínas e vegetais, moderar carboidratos de alto índice glicêmico, indicar porções caseiras).

REGRAS OBRIGATÓRIAS:
- NÃO prescrever dieta médica nem prometer efeito terapêutico; é sugestão educativa.
- Se as fotos não mostrarem comida, devolve plate vazio e explica em limitations.
- Inclui eatingOrder: a ORDEM recomendada de comer os itens do prato (ciência de ordem alimentar —
  fibra/vegetais e proteína antes do carboidrato reduzem o pico glicêmico). 2-4 passos curtos.
- Resposta APENAS em JSON válido, sem markdown:
{
  "plate": [{"item":"alimento visto na foto","portion":"porção caseira ex.: 4 colheres de sopa"}],
  "rationale": "por que essa combinação é boa para o controle glicêmico (curto)",
  "eatingOrder": ["1. Comece pela salada/vegetais", "2. Depois a proteína", "3. Por último o arroz/carboidrato"],
  "estimated": {"calories":0,"carbs_g":0,"protein_g":0,"fat_g":0},
  "tips": ["dica curta de preparo/substituição usando só o que há na foto"],
  "limitations": "o que não dá para saber pelas fotos"
}`;

  const imageParts = await Promise.all(
    files.map(async (f) => {
      const buffer = Buffer.from(await f.arrayBuffer());
      return {
        type: "image_url" as const,
        image_url: { url: `data:${f.type || "image/jpeg"};base64,${buffer.toString("base64")}` },
      };
    })
  );

  const openai = createAiClient();
  let completion;
  try {
    completion = await openai.chat.completions.create({
      ...aiProviderOptions(),
      model: aiModel(),
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, ...imageParts] }],
      max_tokens: 1200,
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  let json: unknown;
  try {
    json = JSON.parse(completion.choices[0]?.message?.content ?? "");
  } catch {
    return NextResponse.json(
      { error: "A resposta do modelo não era JSON válido. Tente novamente." },
      { status: 502 }
    );
  }

  const parsed = resultSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "O modelo não devolveu o formato esperado. Tente novamente." },
      { status: 502 }
    );
  }

  return NextResponse.json(parsed.data);
}

export const runtime = "nodejs";
export const maxDuration = 60;
