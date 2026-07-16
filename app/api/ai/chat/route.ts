import { NextResponse } from "next/server";
import OpenAI from "openai";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { buildUserContext } from "@/lib/ai/user-context";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;

const SYSTEM = `Você é o copiloto metabólico GLYX: linguagem clínica, racional e segura em português do Brasil.
Você recebe um resumo dos dados recentes do usuário (glicemia, refeições, insulina extra aplicada, bebidas, exercício) — use-os para respostas concretas e personalizadas em vez de genéricas.
Nunca prescreva nem calcule doses de insulina ou medicação; ao comentar doses extras registradas, trate como dado observado e reforce que ajustes são decisão do médico. Antes de sugestões específicas, peça contexto se faltar dado.
Se o usuário relatar sintomas graves (hipoglicemia intensa, confusão, dor torácica), oriente buscar serviço de emergência.`;

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

  const body = (await req.json()) as { messages?: { role: string; content: string }[] };
  const messages = body.messages ?? [];
  if (!messages.length) {
    return NextResponse.json({ error: "Mensagens vazias." }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `Conversa muito longa (máx. ${MAX_MESSAGES} mensagens). Inicie um novo chat.` },
      { status: 400 }
    );
  }
  if (messages.some((m) => typeof m.content !== "string" || m.content.length > MAX_MESSAGE_CHARS)) {
    return NextResponse.json(
      { error: `Mensagem muito longa (máx. ${MAX_MESSAGE_CHARS} caracteres).` },
      { status: 400 }
    );
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json({
      reply:
        "Configure OPENAI_API_KEY no servidor para ativar o modelo. Enquanto isso, use o painel para registrar dados e consulte seu médico para decisões terapêuticas.",
      demo: true,
    });
  }

  const rate = await checkAndRecordAiUsage(supabase, user.id, "chat");
  if (!rate.allowed) {
    return NextResponse.json({ error: rateLimitMessage(rate) }, { status: 429 });
  }

  // Contexto real do usuário (glicemia, refeições, insulina extra, bebidas,
  // exercício) — sem isso o copiloto conversa às cegas. Falha de contexto não
  // derruba o chat.
  let userContext = "";
  try {
    userContext = await buildUserContext(supabase, user.id);
  } catch {
    /* segue sem contexto */
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let stream;
  try {
    stream = await openai.chat.completions.create({
      model: aiModel(),
      messages: [
        { role: "system", content: SYSTEM },
        ...(userContext ? [{ role: "system" as const, content: userContext }] : []),
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      max_tokens: 800,
      stream: true,
      stream_options: { include_usage: true },
    });
  } catch (e) {
    return NextResponse.json({ error: providerErrorMessage(e) }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
          if (chunk.usage) usage = chunk.usage;
        }
      } catch {
        // conexão com o provedor caiu no meio — encerra com o que já foi enviado
      }
      await recordAiTokens(supabase, rate.usageId, usage, aiModel());
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
