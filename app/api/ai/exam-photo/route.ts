import { NextResponse } from "next/server";
import OpenAI from "openai";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { defaultTitleFor, visionPromptFor, visionTemperatureFor } from "@/lib/exams/prompts";
import { examPhotoResultSchema, parseExamType } from "@/lib/exams/types";
import { createClient } from "@/lib/supabase/server";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 3;

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
  const titleInput = String(formData.get("title") ?? "").trim();
  const examType = parseExamType(formData.get("examType") ?? formData.get("exam_type"));

  // Aceita "image" (uma foto, compatibilidade) e "images" (páginas de PDF convertidas)
  const single = formData.get("image");
  const files = [
    ...(single instanceof Blob && single.size > 0 ? [single] : []),
    ...formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0),
  ];

  if (!files.length) {
    return NextResponse.json({ error: "Imagem obrigatória." }, { status: 400 });
  }
  if (files.length > MAX_PAGES) {
    return NextResponse.json({ error: `Máximo de ${MAX_PAGES} páginas por análise.` }, { status: 400 });
  }
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Arquivo muito grande (máx. 4 MB no total). Reduza a resolução e tente de novo." },
      { status: 413 }
    );
  }
  if (files.some((f) => f.type && !f.type.startsWith("image/"))) {
    return NextResponse.json({ error: "Os arquivos precisam ser imagens." }, { status: 415 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "Chave de IA não configurada no servidor.", demo: true },
      { status: 503 }
    );
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "exam");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  const imageParts = await Promise.all(
    files.map(async (f) => {
      const buffer = Buffer.from(await f.arrayBuffer());
      return {
        type: "image_url" as const,
        image_url: { url: `data:${f.type || "image/jpeg"};base64,${buffer.toString("base64")}` },
      };
    })
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: aiModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: visionPromptFor(examType) }, ...imageParts],
        },
      ],
      max_tokens: 1600,
      temperature: visionTemperatureFor(examType),
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  await recordAiTokens(supabase, rate.usageId, completion.usage, aiModel());

  const raw = completion.choices[0]?.message?.content ?? "";
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "A resposta do modelo não era JSON válido. Tente novamente." },
      { status: 502 }
    );
  }

  const parsed = examPhotoResultSchema.safeParse({
    ...(typeof json === "object" && json ? json : {}),
    modality: examType,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "O modelo não devolveu o formato esperado. Tente novamente." },
      { status: 502 }
    );
  }

  const hasText = parsed.data.extractedText.trim().length > 0;
  const hasFindings = (parsed.data.findings?.length ?? 0) > 0;
  const hasSummary = parsed.data.summary.trim().length > 0;
  if (!hasSummary || (!hasText && !hasFindings)) {
    return NextResponse.json(
      {
        error: `Não consegui analisar esta imagem como ${examType === "lab" ? "exame laboratorial" : examType === "ecg" ? "ECG" : "Raio-X"}. ${parsed.data.limitations}`,
      },
      { status: 422 }
    );
  }

  const { extractedText, suggestedTitle, ...summary } = parsed.data;
  const title = titleInput || suggestedTitle || defaultTitleFor(examType);

  const { data: exam, error: insertErr } = await supabase
    .from("exams")
    .insert({
      user_id: user.id,
      title,
      exam_type: examType,
      raw_text: extractedText || summary.summary,
      parsed_summary: summary as unknown as Record<string, unknown>,
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ examId: exam?.id ?? null, title, examType, summary });
}

export const runtime = "nodejs";
export const maxDuration = 60;
