import { NextResponse } from "next/server";
import OpenAI from "openai";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { examPhotoResultSchema } from "@/lib/exams/types";
import { createClient } from "@/lib/supabase/server";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 3;

const PROMPT = `És um assistente clínico-educativo para leigos (Português do Brasil).
As imagens são páginas do MESMO exame laboratorial ou laudo médico (foto ou PDF digitalizado).

REGRAS OBRIGATÓRIAS:
- NÃO faças diagnóstico nem conclusões médicas definitivas.
- NÃO alteres doses nem recomendes medicamentos.
- Se a imagem NÃO for um exame/laudo legível, devolve extractedText vazio e explica em limitations.
- Se houver valores numéricos com faixa de referência na imagem, classifica cada um como "normal" (dentro
  da faixa), "atencao" (borderline / levemente fora) ou "alterado" (claramente fora) — só quando a faixa de
  referência estiver visível ou for um valor amplamente padronizado; senão, omite esse item.
- Resposta APENAS em JSON válido, sem markdown, com este schema:
{
  "extractedText": "transcrição fiel do texto/valores legíveis do exame",
  "suggestedTitle": "título curto ex.: Hemograma jan/2026",
  "summary": "parágrafo curto sobre o que o exame parece reportar (factual, sem diagnosticar)",
  "values": [{"parameter":"ex.: Glicose em jejum","value":"126 mg/dL","referenceRange":"70-99 mg/dL","status":"alterado"}],
  "terms": [{"term":"...", "plainLanguage":"..."}],
  "questionsForDoctor": ["..."],
  "limitations": "o que não podes concluir com esta imagem"
}`;

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
          content: [{ type: "text", text: PROMPT }, ...imageParts],
        },
      ],
      max_tokens: 1600,
      temperature: 0.3,
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

  const parsed = examPhotoResultSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "O modelo não devolveu o formato esperado. Tente novamente." },
      { status: 502 }
    );
  }

  if (!parsed.data.extractedText.trim()) {
    return NextResponse.json(
      { error: `Não consegui ler um exame nesta imagem. ${parsed.data.limitations}` },
      { status: 422 }
    );
  }

  const { extractedText, suggestedTitle, ...summary } = parsed.data;
  const title =
    titleInput ||
    suggestedTitle ||
    `Exame por foto ${new Date().toLocaleDateString("pt-BR")}`;

  const { data: exam, error: insertErr } = await supabase
    .from("exams")
    .insert({
      user_id: user.id,
      title,
      raw_text: extractedText,
      parsed_summary: summary as unknown as Record<string, unknown>,
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ examId: exam?.id ?? null, title, summary });
}

export const runtime = "nodejs";
export const maxDuration = 60;
