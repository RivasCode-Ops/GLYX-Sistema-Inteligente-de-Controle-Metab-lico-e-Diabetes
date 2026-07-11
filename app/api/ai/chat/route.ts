import { NextResponse } from "next/server";
import OpenAI from "openai";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { checkAndRecordAiUsage, rateLimitMessage } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;

const SYSTEM = `Você é o copiloto metabólico GLYX: linguagem clínica, racional e segura em português do Brasil.
Nunca prescreva doses ou substitua o médico. Antes de sugestões específicas, peça contexto se faltar dado.
Se o usuário relatar sintomas graves, oriente buscar serviço de emergência.`;

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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: aiModel(),
    messages: [
      { role: "system", content: SYSTEM },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
    max_tokens: 800,
  });

  const reply = completion.choices[0]?.message?.content ?? "";
  return NextResponse.json({ reply, demo: false });
}
