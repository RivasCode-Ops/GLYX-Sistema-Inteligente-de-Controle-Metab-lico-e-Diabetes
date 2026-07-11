import { NextResponse } from "next/server";
import OpenAI from "openai";
import { isOpenAIConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

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

  if (!isOpenAIConfigured()) {
    return NextResponse.json({
      reply:
        "Configure OPENAI_API_KEY no servidor para ativar o modelo. Enquanto isso, use o painel para registrar dados e consulte seu médico para decisões terapêuticas.",
      demo: true,
    });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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
