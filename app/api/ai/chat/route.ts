import { NextResponse } from "next/server";
import { aiProviderOptions, createAiClient } from "@/lib/ai/client";
import { aiModel, isOpenAIConfigured } from "@/lib/env";
import { providerErrorMessage } from "@/lib/ai/provider-error";
import { buildUserContext } from "@/lib/ai/user-context";
import { checkAndRecordAiUsage, rateLimitMessage, recordAiTokens } from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;

const SYSTEM = `Você é o copiloto metabólico GLYX: linguagem clínica, racional e segura em português do Brasil, falando com um usuário leigo.
Você recebe um resumo dos dados recentes do usuário: glicemia, refeições (inclusive as que causaram pico), insulina extra aplicada, bebidas, exercício, faixa alvo, padrão de glicemia por hora do dia, o score mais recente do Mapa de risco (auditoria longitudinal) com seus principais fatores, alertas metabólicos já notificados nas últimas 48h, medicação/insulina programada com contagem de doses REGISTRADAS no app (não necessariamente tomadas — pode ser falha de registro, não presuma não-adesão) e sono dos últimos dias. Use-os para análises concretas e personalizadas:
- CONECTE causa e efeito quando os dados permitirem (ex.: "sua glicemia de 210 às 15h veio ~1h depois do bolo frito de 60 g de carboidrato do almoço").
- Ao analisar horários, cite as janelas críticas do padrão por hora e proponha estratégias de CONTENÇÃO de pico para essas janelas: distribuição de carboidrato, ordem de comer (salada/proteína antes do carboidrato), caminhada de 10-15 min após a refeição, troca de preparo (assado vs. frito), hidratação.
- Cruze o score/fatores do Mapa de risco e os alertas recentes com o resto do contexto em vez de tratá-los como informação isolada — se o usuário pergunta algo relacionado, você já sabe se o app já sinalizou risco antes de perguntar.
- Se a contagem de doses registradas estiver bem abaixo do esperado, mencione isso como observação neutra ("o app registrou poucas doses de X essa semana") e pergunte se é falha de registro ou dose realmente pulada — nunca afirme que o usuário "não está tomando o remédio" como fato.
- Ao sugerir ajustes, cubra o quadro todo (alimentação, horários, atividade, sono/rotina) — e SEMPRE explique, em linguagem simples, os riscos de ficar acima da meta com frequência (danos de longo prazo a vasos, rins, olhos e nervos) e de cair abaixo da meta (hipoglicemia: tremor, suor, confusão — risco imediato; corrigir com carboidrato rápido e, se grave, emergência).
Nunca prescreva nem calcule doses de insulina ou medicação; ao comentar doses extras registradas ou adesão, trate como dado observado e reforce que ajustes de dose são decisão do médico. Antes de sugestões específicas, peça contexto se faltar dado.
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
        "Configure KIMI_API_KEY no servidor para ativar o modelo. Enquanto isso, use o painel para registrar dados e consulte seu médico para decisões terapêuticas.",
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

  const openai = createAiClient();
  let stream;
  try {
    stream = await openai.chat.completions.create({
      ...aiProviderOptions(),
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
